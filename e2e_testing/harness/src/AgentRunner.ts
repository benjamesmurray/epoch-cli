import { spawn } from "bun";
import { HeuristicsEngine, LoopException } from "./HeuristicsEngine";
import type { DockerConfig } from "./types";
import * as path from "path";
import * as fs from "fs/promises";

export interface RunnerResult {
  durationMs: number;
  status: "Success" | "Failed_Tests" | "Killed_Timeout" | "Killed_Loop" | "Error";
  engine: HeuristicsEngine;
  errorMessage?: string;
  avgTps?: number;
  avgTtftMs?: number;
  totalTokens?: number;
  fullPrompts: any[];
}

export class AgentRunner {
  private command: string[];
  private cwd: string;
  private timeoutMs: number;
  private engine: HeuristicsEngine;

  constructor(command: string[], cwd: string, timeoutMs: number, docker?: DockerConfig, runId: string = "run") {
    if (docker) {
        // e.g. command = ["epochcli", "run", "--model local-main/...", "prompt"]
        const rawPromptString = command.slice(2).join(" ");
        // Strip out the leading/trailing quotes if they were added to keep it as one string
        const cleanArgs = rawPromptString.replace(/^"|"$/g, '');
        const internalCommand = `cp -a /etc/epochcli/. /workspace/ 2>/dev/null || true; git config --global --add safe.directory /workspace; HOME=/workspace LOG_LEVEL=INFO EPOCHCLI_DEBUG_FULL_PROMPT=true bun /cli/packages/epochcli/src/index.ts run --thinking --model local-main/gemma-4-26b-q4-xl "${cleanArgs}"`;
        
        this.command = [
            "docker", "run", "--rm", 
            "--network", docker.network,
            "--add-host", "host.docker.internal:host-gateway",
            "-v", `/home/benmurray/Projects/cli:/cli:ro`,
            "-v", `${cwd}:/workspace`,
            "-w", "/workspace",
            "-e", "GITHUB_TOKEN=mock-token-for-docker",
            "-e", "GITHUB_MODELS_TOKEN=mock-token-for-docker",
            "-e", "XDG_DATA_HOME=/workspace/.local/share"
        ];
        if (docker.memoryLimit) {
            this.command.push("--memory", docker.memoryLimit);
        }
        this.command.push(docker.imageName, "/bin/bash", "-c", `${internalCommand}; chmod -R 777 /workspace`);
        
        this.cwd = cwd; 
    } else {
        this.command = command;
        this.cwd = cwd;
    }

    this.timeoutMs = timeoutMs;
    this.engine = new HeuristicsEngine(runId);
  }

  public async run(): Promise<RunnerResult> {
    const startTime = Date.now();
    let status: RunnerResult["status"] = "Success";
    let errorMessage: string | undefined;

    const controller = new AbortController();
    const logFilePath = path.join(this.cwd, "run.log");
    const logFile = await fs.open(logFilePath, "a");
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      status = "Killed_Timeout";
      errorMessage = `Execution timed out after ${this.timeoutMs}ms`;
    }, this.timeoutMs);

    try {
      const proc = spawn({
        cmd: this.command,
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
        signal: controller.signal,
        env: {
            ...process.env,
            LOG_LEVEL: "INFO",
            EPOCHCLI_DEBUG_FULL_PROMPT: "true"
        }
      });

      // Stream processing helper
      const processStream = async (stream: ReadableStream) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunkStr = decoder.decode(value, { stream: true });
            await logFile.appendFile(chunkStr);
            
            buffer += chunkStr;
            const lines = buffer.split("\n");
            
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
              try {
                this.engine.processLine(line);
              } catch (e) {
                if (e instanceof LoopException) {
                  controller.abort();
                  status = "Killed_Loop";
                  errorMessage = e.message;
                  return; // Stop reading on loop detection
                }
                throw e;
              }
            }
          }
          if (buffer) {
             await logFile.appendFile(buffer);
             try {
                this.engine.processLine(buffer);
             } catch (e) {
                 if (e instanceof LoopException) {
                  controller.abort();
                  status = "Killed_Loop";
                  errorMessage = e.message;
                }
             }
          }
        } finally {
          reader.releaseLock();
        }
      };

      const stdoutPromise = processStream(proc.stdout);
      const stderrPromise = processStream(proc.stderr);

      try {
        await proc.exited;
      } catch (e: any) {
        if (status === "Success") {
            status = "Error";
            errorMessage = e.message;
        }
      }

      await Promise.allSettled([stdoutPromise, stderrPromise]);

    } catch (e: any) {
      if (status === "Success") {
        status = "Error";
        errorMessage = e.message;
      }
    } finally {
      clearTimeout(timeoutId);
      await logFile.close();
    }

    const durationMs = Date.now() - startTime;
    const metrics = this.engine.getMetrics();

    return {
      durationMs,
      status,
      engine: this.engine,
      errorMessage,
      fullPrompts: this.engine.getFullPrompts(),
      ...metrics
    };
  }
}

