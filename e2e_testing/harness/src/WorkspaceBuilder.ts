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
      "side_model": "local-side/qwen-35b",
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
            "qwen-35b": { 
              "name": "Qwen 35B Clerk",
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
[mcp_servers.spec]
command = "deliver-cli"
args = ["mcp"]

[mcp_servers.map]
command = "project-map-cli-rust"
args = ["mcp"]

[mcp_servers.ground]
command = "ground-truth-cli-rust"
args = ["mcp"]

[mcp_servers.ground-truth-cli]
command = "ground-truth-cli-rust"
args = ["mcp"]
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
- **Workflow:** Use the 'mcpx' tool with server='spec' and tool='sc_status' to track progress. Mark tasks with 'sc_todo_start' and 'sc_todo_complete'.
- **Discovery:** Use the 'mcpx' tool with server='map' and tool='pm_query' for symbol and file exploration.
- **One-Shot:** In one-shot mode, after running 'sc_init' (via mcpx: e.g., mcpx spec sc_init --name my-project), you MUST first use the 'read' tool to view the generated Specification.md template. Then, in a subsequent turn, use the 'write' tool to overwrite the file entirely with your technical specification, ensuring you remove all '<template-specification>' tags. This is a mandatory safety sequence. Finally, run 'sc_plan' and 'sc_approve' to proceed.
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

