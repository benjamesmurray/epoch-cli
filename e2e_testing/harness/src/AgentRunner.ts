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
  private abortOnGenerate: boolean;
  private runId: string;
  private isAborting: boolean = false;
  private pendingEpochSnapshot: number | null = null;
  private docker?: DockerConfig;
  private yolo: boolean;

  constructor(command: string[], cwd: string, timeoutMs: number, docker?: DockerConfig, runId: string = "run", abortOnGenerate: boolean = false, yolo: boolean = false) {
    this.runId = runId;
    this.abortOnGenerate = abortOnGenerate;
    this.docker = docker;
    this.yolo = yolo;
    if (docker) {
        // Extract the prompt assuming the format is `["epochcli", "run", "prompt"]`
        const promptString = command.slice(2).join(" ");
        const cleanArgs = promptString.replace(/^"|"$/g, '');
        
        // Pass the model defined in the test_config.json via the `--model` flag, defaulting if not found
        // Note: the test config model is typically embedded in the epochcli.jsonc but the CLI prioritizes the flag
        const modelArg = docker.model ? `--model ${docker.model}` : "";
        const yoloArg = yolo ? "--yolo" : "";
        
        const internalCommand = `mkdir -p /workspace/.epochcli; cp -an /etc/epochcli/. /workspace/.epochcli/ 2>/dev/null || true; git config --global --add safe.directory /workspace; HOME=/workspace LOG_LEVEL=DEBUG EPOCHCLI_DEBUG_FULL_PROMPT=true bun /cli/packages/epochcli/src/index.ts run --thinking --print-logs --log-level=DEBUG ${modelArg} ${yoloArg} "${cleanArgs}"`;
        
        this.command = [
            "docker", "run", "--rm", 
            "--network", docker.network,
            "--add-host", "host.docker.internal:host-gateway",
            "-v", `/home/benmurray/Projects/cli:/cli:ro`,
            "-v", `${cwd}:/workspace`,
            "-w", "/workspace",
            "-e", "GITHUB_TOKEN=mock-token-for-docker",
            "-e", "GITHUB_MODELS_TOKEN=mock-token-for-docker",
            "-e", "XDG_DATA_HOME=/workspace/.local/share",
            "-e", "XDG_CONFIG_HOME=/workspace/.config",
            "-e", "EPOCHCLI_TEST_MANAGED_CONFIG_DIR=/workspace/.managed-config-empty",
            "-e", "PATH=/workspace/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "-e", "EPOCHCLI_LIBC=glibc",
            "-e", "EPOCHCLI_DEBUG_FULL_PROMPT=true",
            "-e", "LOG_LEVEL=DEBUG"
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

  private async cleanupPermissions() {
    if (!this.docker) return;
    // Force permissions fix via a small ephemeral container
    const cleanupCmd = [
        "docker", "run", "--rm",
        "-v", `${this.cwd}:/workspace`,
        this.docker.imageName,
        "chmod", "-R", "777", "/workspace"
    ];
    try {
        const proc = spawn({ cmd: cleanupCmd });
        await proc.exited;
    } catch (e) {
        console.error(`    [${this.runId}] ⚠️ Failed to cleanup permissions: ${e}`);
    }
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
            LOG_LEVEL: "DEBUG",
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
                const prevEpochs = this.engine.totalEpochs;
                const prevWrites = this.engine.lastContinuityWrite;
                this.engine.processLine(line);
                
                // If transition detected, mark for numbered snapshot
                if (this.engine.totalEpochs > prevEpochs) {
                    this.pendingEpochSnapshot = this.engine.totalEpochs;
                }

                if (this.engine.lastContinuityWrite > prevWrites) {
                    const continuityFile = path.join(this.cwd, ".epoch-continuity.md");
                    const latestPath = path.join(this.cwd, `continuity_latest.md`);
                    
                    // Always update the latest summary
                    fs.copyFile(continuityFile, latestPath).catch(() => {});

                    if (this.pendingEpochSnapshot !== null) {
                        const epochNum = this.pendingEpochSnapshot;
                        this.pendingEpochSnapshot = null; // Clear it

                        // Transition detected, snapshot the file with retry
                        const snapshotPath = path.join(this.cwd, `continuity_epoch_${epochNum}.md`);
                        
                        let attempts = 0;
                        const maxAttempts = 5;
                        const delay = 500;
                        
                        const trySnapshot = async () => {
                            try {
                                const content = await fs.readFile(continuityFile, "utf-8");
                                await fs.writeFile(snapshotPath, content);
                                console.log(`    [${this.runId}] 💾 Snapshotted Epoch ${epochNum} report to ${snapshotPath}`);
                                return true;
                            } catch (err) {
                                attempts++;
                                if (attempts < maxAttempts) {
                                    await new Promise(resolve => setTimeout(resolve, delay));
                                    return trySnapshot();
                                }
                                console.log(`    [${this.runId}] ⚠️ Could not snapshot continuity report after ${maxAttempts} attempts: ${err}`);
                                return false;
                            }
                        };
                        trySnapshot();
                    }
                }

                if (this.abortOnGenerate && this.engine.hasFullPayload() && !this.isAborting) {
                  this.isAborting = true;
                  console.log(`    [${this.runId}] 🛑 Aborting execution as requested (--abort-on-generate)`);
                  controller.abort();
                  proc.kill(9); // Forceful kill
                  return;
                }
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

      // Telemetry Polling (JSONL stream)
      const telemetryPromise = (async () => {
          let lastSize = 0;
          let telemetryFile: string | null = null;
          
          while (!proc.killed && proc.exitCode === null) {
              if (!telemetryFile) {
                  // Try to find the telemetry file
                  const logDir = path.join(this.cwd, ".local", "share", "epochcli", "log");
                  try {
                      const files = await fs.readdir(logDir);
                      const latest = files.filter(f => f.endsWith(".telemetry.jsonl")).sort().reverse()[0];
                      if (latest) telemetryFile = path.join(logDir, latest);
                  } catch (e) {}
              }

              if (telemetryFile) {
                  try {
                      const stats = await fs.stat(telemetryFile);
                      if (stats.size > lastSize) {
                          const file = await fs.open(telemetryFile, "r");
                          const buffer = Buffer.alloc(stats.size - lastSize);
                          await file.read(buffer, 0, stats.size - lastSize, lastSize);
                          await file.close();
                          
                          const content = buffer.toString("utf-8");
                          const lines = content.split("\n").filter(Boolean);
                          for (const line of lines) {
                              this.engine.processLine(line);
                          }
                          lastSize = stats.size;
                      }
                  } catch (e) {}
              }
              await new Promise(r => setTimeout(r, 1000));
          }
      })();

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
      await this.cleanupPermissions();
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

