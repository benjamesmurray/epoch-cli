# Guide: Setting Up MCP Servers with `mcpx-rust`

This guide explains how to configure Model Context Protocol (MCP) servers within this project using the `mcpx-rust` CLI utility. By using `mcpx`, we reduce prompt bloat by replacing massive JSON schemas with a single, discoverable CLI interface.

## 1. Installation

`mcpx-rust` is the Rust-based binary used in this project to turn MCP servers into composable shell commands.

```bash
# Via Cargo
cargo install mcpx-rust
```

## 2. Registering Servers

`mcpx-rust` stores its configuration in:
- **Linux/macOS:** `~/.config/mcpx/config.toml`
- **Windows:** `%USERPROFILE%\.config\mcpx\config.toml`

**Note for Windows Users:** `mcpx-rust` relies on the `HOME` environment variable to locate the configuration. If you encounter a "HOME environment variable not set" error, run the following to sync it with your user profile:

- **PowerShell:** `[Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")`
- **CMD:** `setx HOME %USERPROFILE%`

*Note: Restart your terminal session after running these commands.*

### Manual Configuration
Add entries to the `[mcp_servers]` section in your configuration file. 

#### Core Project Configuration (Copy/Paste)
Use this block to quickly enable the project's core MCP servers. 

*Note for Windows: If you get "command not found" errors, ensure your Cargo bin folder (`%USERPROFILE%\.cargo\bin`) is in your PATH, or use the absolute path to the .exe (e.g., `command = "C:/Users/YourName/.cargo/bin/deliver-cli.exe"`).*

```toml
[mcp_servers.map]
command = "project-map-cli-rust"
args = ["mcp"]
```

[mcp_servers.spec]
command = "deliver-cli"
args = ["mcp"]

[mcp_servers.ground]
command = "ground-truth-cli-rust"
args = ["mcp"]
```

#### Additional Servers (e.g., GitHub)
```toml
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }
```

## 3. `epochcli` / `gemini-cli` Integration

To enable `mcpx` integration, update your configuration file (e.g., `.epochcli/epochcli.jsonc` or `.gemini/settings.json`):

```jsonc
{
  "mcpx": {
    "enabled": true,
    "binaryPath": "mcpx-rust" // Optional: defaults to 'mcpx-rust'
  },
  "mcp": {} // Leave empty to disable standard schema-based MCP tools
}
```

When enabled, the CLI will only expose a single `mcpx` tool to the LLM. The agent will discover capabilities dynamically by running `mcpx <server> --help`.

## 4. Usage and Composition

Once configured, tools can be called using standard shell composition:

```bash
# List all servers
mcpx-rust list

# List tools for a server
mcpx-rust github

# Inspect a specific tool's schema
mcpx-rust github search-repositories --help

# Call a tool and pipe to jq
mcpx-rust github search-repositories query=mcp --json | jq -r '.content[0].text'
```

Note: `mcpx-rust` uses `key=value` syntax for positional arguments or standard `--flag value` syntax depending on the tool's implementation.

## 5. Project Servers

The following project-specific servers are pre-configured. Agents should use the unified `mcpx` tool for all operations:

- **`spec`**: Management of specification-driven development.
    - `mcpx spec sc_status`: View project health and next steps.
    - `mcpx spec sc_todo_start`: Mark a task as active.
- **`map`**: Architectural mapping and symbol analysis.
    - `mcpx map pm_query`: Search for symbols or get file context.
    - `mcpx map pm_plan`: Analyze the architectural impact of a change.
- **`ground`**: Synthesis of behavioral rules and operational facts.
    - `mcpx ground gt_status`: Check current project rules.
    - `mcpx ground gt_refresh`: Force a refresh of the project constitution.

## 6. Agent SOP: Adding a New Server

When an agent is instructed to add or install a new MCP server, it MUST follow this sequence to ensure the server is properly registered and discoverable:

1.  **Identify the Server**: Determine the correct command (e.g., `npx -y package-name`) or binary path for the requested MCP server.
2.  **Register the Server**: Update the configuration in `~/.config/mcpx/config.toml`.
    - *Note*: Agents must use `echo` or `cat <<EOF` via `run_shell_command` to modify this file, as it lives outside the standard workspace directory.
3.  **Verify Installation**: Run `mcpx-rust list` and `mcpx-rust <new_server> --help` to ensure the routing engine recognizes the new server and the tool schema is accessible.
4.  **Update Project Knowledge**: Update `AGENTS.md` (or the relevant instruction file) with a brief summary of the new server's capabilities and its `mcpx` syntax so that future agent turns can utilize the new tools.
