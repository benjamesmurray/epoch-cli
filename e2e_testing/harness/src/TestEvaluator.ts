import { spawn } from "bun";
import * as fs from "fs/promises";
import { DockerConfig } from "./types";
import * as path from "path";

export class TestEvaluator {
  public static async evaluate(cwd: string, docker?: DockerConfig, relativeTarget?: string): Promise<boolean> {
    try {
      // Ensure the directory exists on the host
      await fs.stat(cwd);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        return false;
      }
      throw e;
    }

    try {
      if (docker && relativeTarget) {
          // Run test inside docker
          const containerTargetDir = path.posix.join("/workspace", relativeTarget);
          
          // First check code quality (tsc typecheck if tsconfig exists)
          let hasTsConfig = false;
          try {
            await fs.stat(path.join(cwd, relativeTarget, "tsconfig.json"));
            hasTsConfig = true;
          } catch(e) {}

          if (hasTsConfig) {
              const lintProc = spawn({
                  cmd: [
                      "docker", "run", "--rm",
                      "-v", `${cwd}:/workspace`,
                      "-w", containerTargetDir,
                      docker.imageName,
                      "bunx", "tsc", "--noEmit"
                  ],
                  stdout: "pipe",
                  stderr: "pipe"
              });
              const lintExit = await lintProc.exited;
              if (lintExit !== 0) return false;
          }

          // Then run bun test
          const proc = spawn({
              cmd: [
                  "docker", "run", "--rm",
                  "-v", `${cwd}:/workspace`,
                  "-w", containerTargetDir,
                  docker.imageName,
                  "bun", "test"
              ],
              stdout: "pipe",
              stderr: "pipe"
          });
          const exitCode = await proc.exited;
          return exitCode === 0;
      } else {
          // Standard host run
          const proc = spawn({
            cmd: ["bun", "test"],
            cwd: cwd,
            stdout: "pipe",
            stderr: "pipe",
          });
    
          const exitCode = await proc.exited;
          return exitCode === 0;
      }
    } catch (e: any) {
      return false;
    }
  }
}


