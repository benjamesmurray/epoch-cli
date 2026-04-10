import * as fs from "fs/promises";
import * as path from "path";

export class WorkspaceBuilder {
  /**
   * Prepares an isolated workspace directory with the specific configs.
   */
  public static async buildDockerWorkspace(hostRunDir: string): Promise<void> {
    await fs.mkdir(hostRunDir, { recursive: true });

    // Create the .epochcli config folder
    const epochcliDir = path.join(hostRunDir, ".epochcli");
    await fs.mkdir(epochcliDir, { recursive: true });

    // Generate the epochcli.jsonc payload matching the user's dual-model config
    // but pointing to the offline MCP installations and host's LLM ports.
    const epochConfig = {
      "$schema": "https://opencode.ai/config.json",
      "provider": {
        "local-main": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Gemma (RTX 4090)",
          "options": {
            "baseURL": "http://host.docker.internal:8085/v1",
            "apiKey": "2250"
          },
          "models": {
            "gemma-4-26b-q4-xl": { "name": "Gemma 4 26B" },
            "gemma-4-q5": { "name": "Gemma 4 26B Q5" },
            "qwen-3.5": { "name": "Qwen 3.5" }
          }
        },
        "local-side": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Nemotron (RTX 4090)",
          "options": {
            "baseURL": "http://host.docker.internal:8086/v1",
            "apiKey": "2250"
          },
          "models": {
            "nemotron-3-nano-4b": { "name": "Nemotron 3 Nano" }
          }
        }
      },
      "model": "local-main/gemma-4-26b-q4-xl",
      "mcp": {
        "mcp-spec-cli": {
          "type": "local",
          "command": ["mcp-spec-cli"]
        },
        "project-map-cli": {
          "type": "local",
          "command": ["/opt/project-map-cli-env/bin/python", "/cli/project-map-cli/src/project_map_cli/mcp/server.py"]
        },
        "ground-truth-cli": {
          "type": "local",
          "command": ["ground-truth-cli"]
        }
      },
      "experimental": {
        "mcp_timeout": 120000
      },
      "tools": {
        "github-triage": false,
        "github-pr-search": false
      }
    };

    await fs.writeFile(
      path.join(epochcliDir, "epochcli.json"),
      JSON.stringify(epochConfig, null, 2),
      "utf-8"
    );

    // Initialize as a git repository to provide a stable VCS anchor
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    try {
        await execAsync("git init", { cwd: hostRunDir });
    } catch (e) {
        // Ignore if git is not available on host, though it should be
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
  }
}

