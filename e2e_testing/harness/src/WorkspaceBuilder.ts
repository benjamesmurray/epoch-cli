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
    const epochConfig = {
      ...config.epochcli,
      "provider": {
        "local-main": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Gemma (H100 x 8)",
          "options": {
            "baseURL": "http://localhost:8085/v1",
            "apiKey": "2250"
          },
          "models": {
            "gemma-4-26b-q4-xl": { "name": "Gemma 4 26B" },
            "qwen-3.5": { "name": "Qwen 3.5" }
          }
        },
        "local-side": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Local Nemotron (RTX 4090)",
          "options": {
            "baseURL": "http://localhost:8086/v1",
            "apiKey": "2250"
          },
          "models": {
            "nemotron-3-nano-4b": { "name": "Nemotron 3 Nano" }
          }
        }
      },
      "model": "local-main/gemma-4-26b-q4-xl",
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
[servers.mcp-spec-cli]
command = "/usr/local/bin/mcp-spec-cli"

[servers.spec]
command = "/usr/local/bin/mcp-spec-cli"

[servers.project-map-cli]
command = "/opt/project-map-cli-env/bin/python"
args = ["-m", "project_map_cli.mcp.server"]

[servers.map]
command = "/opt/project-map-cli-env/bin/python"
args = ["-m", "project_map_cli.mcp.server"]

[servers.ground-truth-cli]
command = "/usr/local/bin/ground-truth-cli"

[servers.ground]
command = "/usr/local/bin/ground-truth-cli"
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
        
        // Full name shims
        await writeShim("mcp-spec-cli", "mcp-spec-cli");
        await writeShim("project-map-cli", "project-map-cli");
        await writeShim("ground-truth-cli", "ground-truth-cli");

        // Short aliases (for AGENTS.md instructions)
        await writeShim("spec", "mcp-spec-cli");
        await writeShim("map", "project-map-cli");
        await writeShim("ground", "ground-truth-cli");

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
      "# Project Guidelines\n- Use functional programming patterns.\n- Ensure all components are accessible.",
      "utf-8"
    );

    await fs.writeFile(
      path.join(hostRunDir, ".cursorrules"),
      "Preferred Style: Tailwind CSS for styling.",
      "utf-8"
    );
  }
}

