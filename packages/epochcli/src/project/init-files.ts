import fs from "fs/promises"
import path from "path"
import { zodToJsonSchema } from "zod-to-json-schema"
import { Config } from "../config/config"
import { Log } from "../util/log"

const log = Log.create({ service: "project-init" })

const AGENTS_MD_CONTENT = `# Epoch CLI Agent Guidelines

## 1. Mandatory Workflows
- **\`mcpx\` (Unified MCP Interface)**: Use for ALL MCP interactions (spec, map, ground, github).
    - **Adding Servers**: When asked to install or configure a new MCP server, you MUST follow the SOP defined in \`docs/MCP_config_guide.md\`.
    - **Syntax**: Pass arguments via standard flags, \`key=value\` strings, or structured JSON.
    - **Self-Discovery**: Use \`tool="--help"\` or \`args=["--help"]\` to inspect servers/tools.
- **\`spec\` (State Management)**: Maintain project state via \`mcpx\` server="spec".
    - **Linear Progression**: \`sc_init\` -> \`write Specification.md\` -> \`sc_approve\` -> \`write Tasks.json\` -> \`sc_approve\` -> \`Build\`.
    - **Arguments**: \`sc_init\` MANDATES the \`name\` parameter (e.g., \`flags: {"name": "my-feature"}\`). \`sc_plan\` and \`sc_approve\` take NO arguments. \`sc_todo_*\` requires \`--id\`.
- **\`map\` (Architectural Discovery)**: Use \`mcpx\` server="map" for navigation. Prefer \`pm_status\` and \`pm_query\` over manual \`ls\` or \`glob\`.

## 2. Enforcement
- **Drafting Wall**: All template tags in \`Specification.md\` must be cleared and \`template_tags_present\` set to \`false\` before implementation.
- **Orientation**: Trust the provided context. If \`ORIENTATION_REQUIREMENTS: SATISFIED\` is present, do not repeat discovery tools.
- **YOLO Mode**: Proceed autonomously until \`task_complete\` is called.

## 3. Subagent Guardrails
- **No State Mutation**: Subagents (e.g., \`@explore\`, \`@general\`) are STRICTLY FORBIDDEN from calling \`sc_init\` or \`sc_approve\`. Only the primary \`plan\` or \`build\` agent may mutate the global project lifecycle state.
- **Architectural Discovery**: Subagents MUST prioritize \`mcpx map\` tools (\`pm_query\` for context, \`pm_fetch_symbol\` for precise code extraction) to navigate the codebase efficiently. Avoid wide \`glob\` or \`read\` loops on large files.
`

const MCP_CONFIG_GUIDE_CONTENT = `# Guide: Setting Up MCP Servers with \`mcpx-rust\`

This guide explains how to configure Model Context Protocol (MCP) servers within this project using the \`mcpx-rust\` CLI utility. By using \`mcpx\`, we reduce prompt bloat by replacing massive JSON schemas with a single, discoverable CLI interface.

## 1. Installation

\`mcpx-rust\` is the Rust-based binary used in this project to turn MCP servers into composable shell commands.

\`\`\`bash
# Via Cargo
cargo install mcpx-rust
\`\`\`

## 2. Registering Servers

\`mcpx-rust\` stores its configuration in \`~/.config/mcpx/config.toml\`. You must edit this file manually to add or modify servers.

### Manual Configuration
Add entries to the \`[mcp_servers]\` section in \`~/.config/mcpx/config.toml\`:

\`\`\`toml
[mcp_servers.map]
command = "project-map-cli-rust"
args = ["mcp"]

[mcp_servers.spec]
command = "deliver-cli"
args = ["mcp"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "\${GITHUB_TOKEN}" }
\`\`\`

## 3. \`epochcli\` / \`gemini-cli\` Integration

To enable \`mcpx\` integration, update your configuration file (e.g., \`.epochcli/epochcli.jsonc\` or \`.gemini/settings.json\`):

\`\`\`jsonc
{
  "mcpx": {
    "enabled": true,
    "binaryPath": "mcpx-rust" // Optional: defaults to 'mcpx-rust'
  },
  "mcp": {} // Leave empty to disable standard schema-based MCP tools
}
\`\`\`

When enabled, the CLI will only expose a single \`mcpx\` tool to the LLM. The agent will discover capabilities dynamically by running \`mcpx <server> --help\`.

## 4. Usage and Composition

Once configured, tools can be called using standard shell composition:

\`\`\`bash
# List all servers
mcpx-rust list

# List tools for a server
mcpx-rust github

# Inspect a specific tool's schema
mcpx-rust github search-repositories --help

# Call a tool and pipe to jq
mcpx-rust github search-repositories query=mcp --json | jq -r '.content[0].text'
\`\`\`

Note: \`mcpx-rust\` uses \`key=value\` syntax for positional arguments or standard \`--flag value\` syntax depending on the tool's implementation.

## 5. Project Servers

The following project-specific servers are pre-configured. Agents should use the unified \`mcpx\` tool for all operations:

- **\`spec\`**: Management of specification-driven development.
    - \`mcpx spec sc_status\`: View project health and next steps.
    - \`mcpx spec sc_todo_start\`: Mark a task as active.
- **\`map\`**: Architectural mapping and symbol analysis.
    - \`mcpx map pm_query\`: Search for symbols or get file context.
    - \`mcpx map pm_plan\`: Analyze the architectural impact of a change.
- **\`ground\`**: Synthesis of behavioral rules and operational facts.
    - \`mcpx ground gt_status\`: Check current project rules.
    - \`mcpx ground gt_refresh\`: Force a refresh of the project constitution.

## 6. Agent SOP: Adding a New Server

When an agent is instructed to add or install a new MCP server, it MUST follow this sequence to ensure the server is properly registered and discoverable:

1.  **Identify the Server**: Determine the correct command (e.g., \`npx -y package-name\`) or binary path for the requested MCP server.
2.  **Register the Server**: Update the configuration in \`~/.config/mcpx/config.toml\`.
    - *Note*: Agents must use \`echo\` or \`cat <<EOF\` via \`run_shell_command\` to modify this file, as it lives outside the standard workspace directory.
3.  **Verify Installation**: Run \`mcpx-rust list\` and \`mcpx-rust <new_server> --help\` to ensure the routing engine recognizes the new server and the tool schema is accessible.
4.  **Update Project Knowledge**: Update \`AGENTS.md\` (or the relevant instruction file) with a brief summary of the new server's capabilities and its \`mcpx\` syntax so that future agent turns can utilize the new tools.
`

const MODEL_CONFIG_GUIDE_CONTENT = `# Model Configuration Guide

Epoch CLI utilizes a **Dual-Model Architecture** optimized for high-performance coding and reliable background supervision. This environment uses a unified proxy architecture (**llama-swap**) to manage model transitions efficiently.

## 1. Unified Architecture (llama-swap)

Instead of managing separate URLs and ports, all models are served through a single transparent proxy on one port. This allows the system to dynamically swap models in VRAM as needed while maintaining a consistent client configuration.

*   **Unified API Endpoint:** \`http://localhost:8085/v1\`
*   **Protocol:** OpenAI Compatible
*   **Authentication:** Shared API Key (e.g., \`2250\`)

## 2. Configuration (\`epochcli.jsonc\`)

You can configure Epoch CLI to use either a single unified endpoint for both main and side roles, or a dual-model configuration that leverages the \`llama-swap\` proxy.

### Option A: Single Endpoint Configuration (Recommended for High Context)

This setup uses one model for both roles. It is ideal for maximizing the context window (e.g., 64k) and eliminating the 15-20 second "cold start" delay associated with swapping models.

\`\`\`jsonc
{
  "model": "local-unified/qwen-unified",
  "side_model": "local-unified/qwen-unified",
  "provider": {
    "local-unified": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Unified (Qwen 64k)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "qwen-unified": {
          "name": "Qwen Unified 64k",
          "limit": { "context": 64000, "output": 4096 }
        }
      }
    }
  }
}
\`\`\`

### Option B: Dual-Model Configuration (llama-swap)

This setup defines separate providers for main and side roles. The proxy handles routing based on the model ID. This is useful when you want a dedicated smaller model for clerk duties to save compute or when specific roles require different model capabilities.

\`\`\`jsonc
{
  "model": "local-main/qwen3.6-35b-a3b-coding", 
  "side_model": "local-side/nemotron-3-nano",
  "provider": {
    "local-main": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Main (Coding)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "qwen3.6-35b-a3b-coding": { 
          "name": "Qwen 3.6 35B Coding",
          "limit": { "context": 64000, "output": 4096 }
        }
      }
    },
    "local-side": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Side (Clerk)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "nemotron-3-nano": { 
          "name": "Nemotron 3 Nano",
          "limit": { "context": 32000, "output": 2048 }
        }
      }
    }
  }
}
\`\`\`

### Switching Between Modes

To switch modes, simply update the \`model\`, \`side_model\`, and \`provider\` fields in your \`.epochcli/epochcli.jsonc\` file to match the desired configuration block. The CLI will automatically pick up the changes on the next execution.

## 3. How Epoch CLI Identifies Models

Epoch CLI uses **keyword matching** on the Model ID string to apply specific architectural optimizations. You do not need to manually configure prompts or behaviors for different models as long as the ID is named correctly:

*   **Qwen Optimized:** If the ID contains \`"qwen"\` (e.g., \`qwen3.6-35b-a3b-coding\`), the CLI automatically sets the temperature to \`0.55\` and Top-P to \`1.0\`.
*   **Gemma Optimized:** If the ID contains \`"gemma-4"\`, the CLI enables reasoning token injection (\`<|think|>\`), specialized system prompts, and the Three-Stage Sanitizer to repair potential JSON errors.

## 4. Operational Considerations

### The "Cold Start" (Model Swapping)
The environment uses a **SWAP approach** to maximize VRAM for high-context models. Only one model is active in memory at a time.
*   **Instant Response:** If you request the model that is already "hot" in memory.
*   **Swap Delay:** If you request a model that is currently swapped out, the proxy will load it automatically. This adds a **15–20 second delay** to the first request.

### Context Persistence & TTL
Models stay active in VRAM for **60 minutes** of inactivity before being automatically unloaded. This ensures subsequent requests within the same hour are nearly instantaneous.

## 5. Monitoring & Maintenance

*   **Dashboard:** You can monitor which model is currently active and view proxy status at \`http://localhost:8085/ui\`.
*   **Restart Stack:** If you need to restart the entire dual-model stack, use the provided launch script:
    \`\`\`bash
    /home/llm/utils/launch/launch-dual.sh
    \`\`\`
`

const DEFAULT_EPOCHCLI_JSONC = `{
  "$schema": "./config.json",
  "model": "local-unified/qwen-unified",
  "side_model": "local-unified/qwen-unified",
  "provider": {
    "local-unified": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Unified (Qwen 64k)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "qwen-unified": {
          "name": "Qwen Unified 64k",
          "limit": {
            "context": 64000,
            "output": 4096
          }
        }
      }
    }
  },
  "permission": {
    "edit": {
      "packages/opencode/migration/*": "deny"
    }
  },
  "mcpx": {
    "enabled": true
  }
}
`

export async function initProjectFiles(directory: string, worktree: string) {
  try {
    const epochcliDir = path.join(worktree, ".epochcli")
    
    try {
      await fs.access(epochcliDir)
      return // Already initialized
    } catch {
      // Doesn't exist, proceed with initialization
    }

    log.info("Initializing new project files", { worktree })

    // Create .epochcli directory
    await fs.mkdir(epochcliDir, { recursive: true })

    // Generate JSON Schema
    const schema = zodToJsonSchema(Config.Info, {
      name: "Config",
      $refStrategy: "none",
    })
    
    // Write config.json (schema)
    await fs.writeFile(
      path.join(epochcliDir, "config.json"),
      JSON.stringify(schema, null, 2)
    )

    // Write default epochcli.jsonc
    await fs.writeFile(
      path.join(epochcliDir, "epochcli.jsonc"),
      DEFAULT_EPOCHCLI_JSONC
    )

    // Setup docs
    const docsDir = path.join(epochcliDir, "docs")
    await fs.mkdir(docsDir, { recursive: true })
    await fs.writeFile(path.join(docsDir, "MCP_config_guide.md"), MCP_CONFIG_GUIDE_CONTENT)
    await fs.writeFile(path.join(docsDir, "model_config.md"), MODEL_CONFIG_GUIDE_CONTENT)

    // Setup AGENTS.md in the current directory if it doesn't exist
    const agentsFile = path.join(directory, "AGENTS.md")
    try {
      await fs.access(agentsFile)
    } catch {
      await fs.writeFile(agentsFile, AGENTS_MD_CONTENT)
      log.info("Created AGENTS.md", { path: agentsFile })
    }

    log.info("Project initialized successfully", { dir: epochcliDir })
  } catch (error) {
    log.error("Failed to initialize project files", { error })
  }
}
