import * as fs from "fs/promises";
import * as path from "path";
import type { TestConfig } from "./types";

export class WorkspaceBuilder {
  /**
   * Prepares an isolated workspace directory with the specific configs.
   */
  public static async buildDockerWorkspace(hostRunDir: string, config: TestConfig): Promise<void> {
    await fs.mkdir(hostRunDir, { recursive: true });

    // Create the .epochcli config folder
    const epochcliDir = path.join(hostRunDir, ".epochcli");
    await fs.mkdir(epochcliDir, { recursive: true });

    // Generate the epochcli.jsonc payload matching the user's dual-model config
    // but pointing to the offline MCP installations and host's LLM ports.
    const mainModelName = config.docker?.model || "local-main/gemma-4-26b-q4-xl";
    const mainModelID = mainModelName.split("/")[1] || "gemma-4-26b-q4-xl";
    const llmHost = config.docker?.network === "host" ? "localhost" : "host.docker.internal";
    
    const epochConfig = {
      ...config.epochcli,
      "model": mainModelName,
      "side_model": "local-side/nemotron-3-nano",
      "provider": {
        "local-main": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Main (llama-swap)",
          "options": {
            "baseURL": `http://${llmHost}:8085/v1`,
            "apiKey": "2250"
          },
          "models": {
            [mainModelID]: { 
                "name": mainModelID,
                "limit": {
                    "output": 4096,
                    "context": config.docker?.contextOverride || 32000
                }
            },
            "gemma-4-q5": { 
              "name": "Gemma 4 26B Q5",
              "limit": { "context": 32000, "output": 4096 }
            },
            "qwen-3.5": { 
              "name": "Qwen 3.5",
              "limit": { "context": 32000, "output": 4096 }
            }
          }
        },
        "local-side": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Side (llama-swap)",
          "options": {
            "baseURL": `http://${llmHost}:8085/v1`,
            "apiKey": "2250"
          },
          "models": {
            "nemotron-3-nano": { 
              "name": "Nemotron 3 Nano",
              "limit": { "context": 32000, "output": 4096 }
            }
          }
        }
      },
      "mcpx": {
        "enabled": true
      },
      "mcp": {},
      "experimental": {
        "mcp_timeout": 120000
      },
      "tools": {
        "github-triage": false,
        "github-pr-search": false
      }
    };


    await fs.writeFile(
      path.join(epochcliDir, "epochcli.jsonc"),
      JSON.stringify(epochConfig, null, 2),
      "utf-8"
    );

    // Create mcpx config file
    const mcpxConfigDir = path.join(hostRunDir, ".config", "mcpx");
    await fs.mkdir(mcpxConfigDir, { recursive: true });
    const mcpxConfig = `
[servers.spec]
command = "node"
args = ["/usr/local/lib/node_modules/@epoch-ai/deliver-cli/dist/index.js"]

[servers.map]
command = "/opt/project-map-cli-env/bin/python"
args = ["-m", "project_map_cli.mcp.server"]

[servers.project-map-cli]
command = "/opt/project-map-cli-env/bin/python"
args = ["-m", "project_map_cli.mcp.server"]

[servers.ground]
command = "node"
args = ["/usr/local/lib/node_modules/ground-truth-cli/dist/index.js"]

[servers.ground-truth-cli]
command = "node"
args = ["/usr/local/lib/node_modules/ground-truth-cli/dist/index.js"]
`;
    await fs.writeFile(
      path.join(mcpxConfigDir, "config.toml"),
      mcpxConfig,
      "utf-8"
    );

    // Initialize as a git repository to provide a stable VCS anchor
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    try {
        await execAsync("git init", { cwd: hostRunDir });
    } catch (e) {
        // Ignore if git is not available on host
    }

    // Install shims for the servers
    try {
        const shimDir = path.join(hostRunDir, ".local", "bin");
        await fs.mkdir(shimDir, { recursive: true });
        
        const writeShim = async (name: string, server: string) => {
            const content = `#!/bin/sh\n# mcpx-shim:server=${server}\nexec mcpx '${server}' "$@"\n`;
            await fs.writeFile(path.join(shimDir, name), content, { mode: 0o755 });
        };
        
        // Canonical shims
        await writeShim("spec", "spec");
        await writeShim("map", "map");
        await writeShim("ground", "ground");

        // Legacy compatibility shims
        await writeShim("project-map-cli", "project-map-cli");
        await writeShim("ground-truth-cli", "ground-truth-cli");

    } catch (e) {
        console.error("Failed to install shims manually:", e);
    }

    // Mock an auth.json to bypass the "no providers found" crash gracefully
    const authDir = path.join(hostRunDir, ".local", "share", "epochcli");
    await fs.mkdir(authDir, { recursive: true });
    
    const mockAuth = {
        "github": { "token": "mock-token-for-docker-isolation" }
    };
    
    await fs.writeFile(
        path.join(authDir, "auth.json"),
        JSON.stringify(mockAuth, null, 2),
        "utf-8"
    );

    // Inject guidelines for Zone 4 testing
    await fs.writeFile(
      path.join(hostRunDir, "AGENTS.md"),
      `# Project Guidelines
- **Senior Style:** Suppress conversational filler. Output ONLY context and code.
- **Workflow:** Use 'spec sc_status' to track progress. Mark tasks with 'spec sc_todo_start' and 'spec sc_todo_complete'.
- **Discovery:** Use 'map pm_query' for symbol and file exploration.
- **One-Shot:** In one-shot mode, immediately run 'spec sc_plan' after 'spec sc_init' to generate tasks, then 'spec sc_approve' to begin coding. Do not spend multiple turns drafting requirements.
- **Continuity:** When a new epoch begins, strictly follow the directives in .epoch-continuity.toon.
- **Architecture:** Keep things flat and composable. Avoid 'any'.`,
      "utf-8"
    );

    await fs.writeFile(
      path.join(hostRunDir, ".cursorrules"),
      "Preferred Style: Tailwind CSS for styling.",
      "utf-8"
    );
  }
}

