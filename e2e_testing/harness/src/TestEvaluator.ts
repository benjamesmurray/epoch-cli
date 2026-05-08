import { spawn } from "bun";
import * as fs from "fs/promises";
import type { DockerConfig } from "./types";
import * as path from "path";

export class TestEvaluator {
  private static async determineTestCommand(targetDir: string): Promise<string[]> {
    const recursiveScan = async (dir: string): Promise<{ hasPyTests: boolean; hasJsTests: boolean }> => {
      let results = { hasPyTests: false, hasJsTests: false };
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__pycache__") continue;
            const subResults = await recursiveScan(fullPath);
            results.hasPyTests = results.hasPyTests || subResults.hasPyTests;
            results.hasJsTests = results.hasJsTests || subResults.hasJsTests;
          } else {
            const name = entry.name;
            if (name.startsWith("test_") && name.endsWith(".py") || name.endsWith("_test.py")) {
              results.hasPyTests = true;
            }
            if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(name)) {
              results.hasJsTests = true;
            }
          }
        }
      } catch (e) {}
      return results;
    };

    try {
      // Phase 1: Configuration-Based Detection
      try {
        await fs.stat(path.join(targetDir, "Cargo.toml"));
        return ["cargo", "test"];
      } catch (e) {}

      try {
        const pytestConfigs = ["pytest.ini", "tox.ini", "conftest.py"];
        for (const config of pytestConfigs) {
          try {
            await fs.stat(path.join(targetDir, config));
            return ["pytest"];
          } catch (e) {}
        }
        
        // Check for pytest in pyproject.toml or setup.cfg
        const pyConfigs = ["pyproject.toml", "setup.cfg"];
        for (const config of pyConfigs) {
          try {
            const content = await fs.readFile(path.join(targetDir, config), "utf-8");
            if (content.includes("[tool.pytest.ini_options]") || content.includes("[pytest]")) {
              return ["pytest"];
            }
          } catch (e) {}
        }
      } catch (e) {}

      try {
        const pkgJsonPath = path.join(targetDir, "package.json");
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
        if (pkgJson.scripts?.test && !pkgJson.scripts.test.includes("no test specified")) {
          return ["bun", "run", "test"];
        }
      } catch (e) {}

      // Phase 2: Heuristic/Pattern-Based Detection (Deep Scan)
      const scan = await recursiveScan(targetDir);
      if (scan.hasPyTests) return ["pytest"];
      if (scan.hasJsTests) return ["bun", "test"];

      // Phase 3: Directory-Based Fallback
      try {
        const testDirs = ["tests", "test"];
        for (const testDir of testDirs) {
          const fullPath = path.join(targetDir, testDir);
          const stat = await fs.stat(fullPath).catch(() => null);
          if (stat?.isDirectory()) {
            const subScan = await recursiveScan(fullPath);
            if (subScan.hasPyTests || (await fs.readdir(fullPath)).some(f => f.endsWith(".py"))) return ["pytest"];
            if (subScan.hasJsTests || (await fs.readdir(fullPath)).some(f => /\.(ts|js)$/.test(f))) return ["bun", "test"];
          }
        }
      } catch (e) {}

    } catch (e) {}

    return ["echo", "No tests generated"];
  }

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
          const hostTargetDir = path.join(cwd, relativeTarget);
          
          // Detect test framework
          const testCmd = await TestEvaluator.determineTestCommand(hostTargetDir);

          const logPath = path.join(hostTargetDir, "test_output.log");
          const logFile = await fs.open(logPath, "w");

          if (testCmd[0] === "echo" && testCmd[1] === "No tests generated") {
            await logFile.appendFile("=== TEST (No tests generated) ===\nAgent did not generate any detectable test files or configurations.\n");
            await logFile.close();
            return false;
          }

          // First check code quality (tsc typecheck if tsconfig exists)
          let hasTsConfig = false;
          try {
            await fs.stat(path.join(hostTargetDir, "tsconfig.json"));
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
              
              const lintOut = await new Response(lintProc.stdout).text();
              const lintErr = await new Response(lintProc.stderr).text();
              await logFile.appendFile("=== TSC TYPECHECK ===\n" + lintOut + lintErr + "\n");

              const lintExit = await lintProc.exited;
              if (lintExit !== 0) {
                  await logFile.close();
                  return false;
              }
          }

          // Then run the test command
          const proc = spawn({
              cmd: [
                  "docker", "run", "--rm",
                  "-v", `${cwd}:/workspace`,
                  "-w", containerTargetDir,
                  docker.imageName,
                  ...testCmd
              ],
              stdout: "pipe",
              stderr: "pipe"
          });
          
          const testOut = await new Response(proc.stdout).text();
          const testErr = await new Response(proc.stderr).text();
          await logFile.appendFile(`=== TEST (${testCmd.join(" ")}) ===\n` + testOut + testErr + "\n");

          const exitCode = await proc.exited;
          await logFile.close();
          return exitCode === 0;
      } else {
          // Standard host run
          const logPath = path.join(cwd, "test_output.log");
          const testCmd = await TestEvaluator.determineTestCommand(cwd);

          if (testCmd[0] === "echo" && testCmd[1] === "No tests generated") {
            await fs.writeFile(logPath, "=== TEST (No tests generated) ===\nAgent did not generate any detectable test files or configurations.\n");
            return false;
          }

          const proc = spawn({
            cmd: testCmd,
            cwd: cwd,
            stdout: "pipe",
            stderr: "pipe",
          });
    
          const testOut = await new Response(proc.stdout).text();
          const testErr = await new Response(proc.stderr).text();
          await fs.writeFile(logPath, `=== TEST (${testCmd.join(" ")}) ===\n` + testOut + testErr + "\n");

          const exitCode = await proc.exited;
          return exitCode === 0;
      }
    } catch (e: any) {
      return false;
    }
  }
}


