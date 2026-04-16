# Guide: Setting Up MCP Servers with `mcpx`

This guide explains how to configure Model Context Protocol (MCP) servers within this project using the `mcpx` CLI utility. By using `mcpx`, we reduce prompt bloat by replacing massive JSON schemas with a single, discoverable CLI interface.

## 1. Installation

`mcpx` is a Go-based binary that turns MCP servers into composable shell commands.

```bash
# Via npm
npm install -g mcpx-go

# Via Homebrew (macOS)
brew tap lydakis/mcpx
brew install --cask mcpx
```

## 2. Registering Servers

`mcpx` stores its configuration in `~/.config/mcpx/config.toml`. You can add servers using the `mcpx add` command or by editing the file manually.

### Using `mcpx add`
Point `mcpx` at a local manifest file (JSON or TOML) or a direct MCP endpoint:

```bash
# Add from a local manifest
mcpx add ./path/to/mcp-manifest.json --name my-server --overwrite

# Add from a remote endpoint
mcpx add https://docs.mcp.cloudflare.com/mcp
```

### Manual Configuration
You can add entries directly to `~/.config/mcpx/config.toml`:

```toml
[servers.project-map-cli]
command = "/home/benmurray/Projects/cli/project-map-cli/venv/bin/python"
args = ["-m", "project_map_cli.mcp.server"]

[servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }
```

## 3. `epochcli` Integration

To enable `mcpx` in `epochcli`, update your `.epochcli/epochcli.jsonc` file:

```jsonc
{
  "mcpx": {
    "enabled": true,
    "binaryPath": "/path/to/mcpx" // Optional: defaults to global 'mcpx'
  },
  "mcp": {} // Leave empty to disable standard schema-based MCP tools
}
```

When enabled, `epochcli` will only expose a single `mcpx` tool to the LLM. The agent will discover capabilities dynamically by running `mcpx <server> --help`.

## 4. Usage and Composition

Once configured, tools can be called using standard shell composition:

```bash
# List all servers
mcpx

# List tools for a server
mcpx github

# Inspect a specific tool's schema
mcpx github search-repositories --help

# Call a tool and pipe to jq
mcpx github search-repositories --query=mcp | jq -r '.items[0].full_name'
```

## 5. Command Shims (Optional)

You can install local passthrough shims so that `<server>` works as a standalone command in your terminal:

```bash
mcpx shim install project-map-cli
project-map-cli pm_status
```

## 6. Project Servers

The following project-specific servers are pre-configured in `mcpx`:
- `mcp-spec-cli`: Management of specification-driven development.
- `project-map-cli`: Architectural mapping and symbol analysis.
- `ground-truth-cli`: Synthesis of behavioral rules and operational facts.
