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
    const mainProviderID = mainModelName.split("/")[0] || "local-main";
    const llmHost = config.docker?.network === "host" ? "localhost" : "host.docker.internal";
    
    const isUnified = mainProviderID === "local-unified";
    
    const epochConfig: any = {
      ...config.epochcli,
      "model": mainModelName,
      "side_model": isUnified ? mainModelName : (config.docker?.side_model || "local-side/qwen-35b"),
      "provider": {
        [mainProviderID]: {
          "npm": "@ai-sdk/openai-compatible",
          "name": isUnified ? "Local Unified (llama-swap)" : "Local Main (llama-swap)",
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

    if (!isUnified) {
      epochConfig.provider["local-side"] = {
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
      };
    }


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

    // Inject guidelines for Zone 4 testing by copying the real AGENTS.md from the project root
    try {
        const rootAgentsPath = path.join("/home/benmurray/Projects/cli", "AGENTS.md");
        const agentsContent = await fs.readFile(rootAgentsPath, "utf-8");
        await fs.writeFile(path.join(hostRunDir, "AGENTS.md"), agentsContent, "utf-8");
    } catch (e) {
        // Fallback for environment robustness
        await fs.writeFile(
            path.join(hostRunDir, "AGENTS.md"),
            "# Project Guidelines\n- Follow standard architectural patterns.",
            "utf-8"
        );
    }
  }
}
