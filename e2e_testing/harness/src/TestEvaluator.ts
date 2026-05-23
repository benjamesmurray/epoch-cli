import { spawn } from "bun";
import * as fs from "fs/promises";
import type { DockerConfig, EvaluationConfig } from "./types";
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

  public static async evaluate(cwd: string, docker?: DockerConfig, relativeTarget?: string, evaluation?: EvaluationConfig): Promise<boolean> {
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
          const logPath = path.join(hostTargetDir, "test_output.log");
          const logFile = await fs.open(logPath, "w");

          // --- ARCHITECTURAL SHIFT: Host-Driven Black-Box Testing ---
          if (evaluation?.type === "host_blackbox") {
              console.log(`    > 📦 Booting Black-Box environment for ${evaluation.startupCommand}...`);
              
              // 1. Start agent app in detached container with dynamic port mapping
              const containerName = `eval-run-${Date.now()}`;
              const startProc = spawn({
                  cmd: [
                      "docker", "run", "-d",
                      "--name", containerName,
                      "--network", docker.network,
                      "-p", evaluation.port.toString(),
                      "-v", `${cwd}:/workspace`,
                      "-w", containerTargetDir,
                      docker.imageName,
                      ...evaluation.startupCommand.split(" ")
                  ],
                  stdout: "pipe"
              });
              
              const containerId = (await new Response(startProc.stdout).text()).trim();
              if (!containerId) {
                  await logFile.appendFile("❌ Failed to start Docker container for evaluation.\n");
                  await logFile.close();
                  return false;
              }

              try {
                  // 2. Discover host-side mapped port (Robust JSON parsing with retries)
                  let mappedPort = "";
                  for (let i = 0; i < 10; i++) {
                      const inspectProc = spawn({
                          cmd: ["docker", "inspect", containerId],
                          stdout: "pipe"
                      });
                      const inspectOutput = await new Response(inspectProc.stdout).text();
                      try {
                          const metadata = JSON.parse(inspectOutput);
                          if (metadata[0]?.State?.Status === "exited") {
                              await logFile.appendFile("❌ Container exited prematurely.\n");
                              break;
                          }
                          const portMapping = metadata[0]?.NetworkSettings?.Ports?.[`${evaluation.port}/tcp`];
                          if (portMapping?.[0]?.HostPort) {
                              mappedPort = portMapping[0].HostPort;
                              break;
                          }
                      } catch (e) {}
                      await new Promise(r => setTimeout(r, 1000));
                  }

                  if (!mappedPort) {
                      await logFile.appendFile("❌ Could not discover mapped port. Check if application is exposing correctly.\n");
                      throw new Error("Port discovery failed");
                  }

                  const targetUrl = `http://localhost:${mappedPort}`;
                  await logFile.appendFile(`ℹ️ Application booting at ${targetUrl}\n`);

                  // 3. Wait-For-It (Polling)
                  let ready = false;
                  for (let i = 0; i < 30; i++) {
                      try {
                          const res = await fetch(targetUrl);
                          if (res.ok || res.status === 404) { // 404 is still "alive"
                              ready = true;
                              break;
                          }
                      } catch(e) {}
                      await new Promise(r => setTimeout(r, 1000));
                  }

                  if (!ready) {
                      await logFile.appendFile("❌ Timed out waiting for application to become healthy.\n");
                      throw new Error("Health check timeout");
                  }

                  // 4. Execute Black-Box Tests on Host
                  console.log(`    > 🧪 Executing Black-Box suite: ${evaluation.testScript}`);
                  const testProc = spawn({
                      cmd: ["bun", "test", evaluation.testScript],
                      env: { ...process.env, TARGET_URL: targetUrl },
                      stdout: "pipe",
                      stderr: "pipe"
                  });

                  const testOut = await new Response(testProc.stdout).text();
                  const testErr = await new Response(testProc.stderr).text();
                  await logFile.appendFile("=== BLACK-BOX TEST RESULTS ===\n" + testOut + testErr + "\n");

                  const exitCode = await testProc.exited;
                  return exitCode === 0;

              } finally {
                  // 5. Cleanup
                  const logsProc = spawn({ cmd: ["docker", "logs", containerId], stdout: "pipe" });
                  const containerLogs = await new Response(logsProc.stdout).text();
                  await logFile.appendFile("=== DOCKER RUNTIME LOGS ===\n" + containerLogs + "\n");
                  
                  spawn({ cmd: ["docker", "rm", "-f", containerId] });
                  await logFile.close();
              }
          }

          // Detect test framework (Legacy path)
          const testCmd = await TestEvaluator.determineTestCommand(hostTargetDir);

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


