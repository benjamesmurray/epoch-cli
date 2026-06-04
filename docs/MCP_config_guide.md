# Guide: Setting Up MCP Servers with `mcpx-rust`

This guide explains how to configure Model Context Protocol (MCP) servers within this project using the `mcpx-rust` CLI utility. By using `mcpx-rust`, we reduce prompt bloat by replacing massive JSON schemas with a single, discoverable CLI interface.

---

## 1. Installation

`mcpx-rust` is the Rust-based binary used in this project to turn MCP servers into composable shell commands.

```bash
# Via Cargo
cargo install mcpx-rust
```

---

## 2. Registering Servers

`mcpx-rust` stores its global routing configuration file in the following locations:

* **Linux/macOS:** `~/.config/mcpx/config.toml`
* **Windows:** `%USERPROFILE%\.config\mcpx\config.toml`

> **Note for Windows Users:** `mcpx-rust` relies on the `HOME` environment variable to locate the configuration folder. If you encounter a "HOME environment variable not set" error, run one of the following commands to sync it with your native user profile:
> * **PowerShell:** `[Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")`
> * **CMD:** `setx HOME %USERPROFILE%`
> 
> *Note: You must completely restart your terminal session or your IDE window after running these commands.*

### Manual Configuration

Add server routing entries to the `[mcp_servers]` section in your configuration file.

#### Core Project Configuration (Copy/Paste)

Use this consolidated block to quickly enable the project's core MCP tools.

*Note for Windows: If you encounter "command not found" errors, ensure your Cargo bin folder (`%USERPROFILE%\.cargo\bin`) is explicitly added to your system PATH, or provide the absolute path to the compiled executable (e.g., `command = "C:/Users/YourName/.cargo/bin/deliver-cli.exe"`).*

```toml
[mcp_servers.map]
command = "project-map-cli-rust"
args = ["mcp"]

[mcp_servers.spec]
command = "deliver-cli"
args = ["mcp"]

[mcp_servers.ground]
command = "ground-truth-cli-rust"
args = ["mcp"]
```

#### Additional External Servers (e.g., GitHub)

```toml
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }
```

*(Note: Ensure your shell contains the target environment variable when starting the host process if your router depends on active token injection).*

---

## 3. `epochcli` / `gemini-cli` Integration

To enable global `mcpx` proxy routing, update your client configuration file (e.g., `.epochcli/epochcli.jsonc` or `.gemini/settings.json`):

```jsonc
{
  "mcpx": {
    "enabled": true,
    "binaryPath": "mcpx-rust" // Optional: defaults to 'mcpx-rust'
  },
  "mcp": {} // Leave empty to disable standard heavy schema-based MCP tool loading
}
```

When enabled, the client framework will only expose a single, lightweight `mcpx` discovery tool to the LLM. The agent will discover capabilities dynamically on an as-needed basis by running `mcpx-rust <server> --help`.

---

## 4. Usage and Composition

Once configured, tools can be queried or piped using standard shell composition principles:

```bash
# List all active registered servers
mcpx-rust list

# List all tools exposed by a specific sub-server
mcpx-rust github

# Inspect a specific tool's argument schema and flags
mcpx-rust github search-repositories --help

# Call a proxy tool directly and pipe the output to jq
mcpx-rust github search-repositories query=mcp --json | jq -r '.content[0].text'
```

*Note: `mcpx-rust` supports `key=value` syntax for positional arguments or standard `--flag value` syntax depending on the target server implementation.*

---

## 5. Project Servers

The following project-specific internal servers are pre-configured. Agents should utilize the unified `mcpx-rust` routing utility for all system operations:

* **`spec`**: Management of specification-driven development flows.
  * `mcpx-rust spec sc_status`: View project implementation health and next steps.
  * `mcpx-rust spec sc_todo_start`: Mark a specific spec task as active.

* **`map`**: Codebase architectural mapping and symbol dependency analysis.
  * `mcpx-rust map pm_query`: Search for symbols or fetch contextual file structures.
  * `mcpx-rust map pm_plan`: Analyze the systemic architectural impact of a proposed change.

* **`ground`**: Synthesis of project-specific behavioral rules and operational facts.
  * `mcpx-rust ground gt_status`: Check current project invariant guidelines.
  * `mcpx-rust ground gt_refresh`: Force a re-index/refresh of the project core constitution.

---

## 6. Agent SOP: Adding a New Server

When an AI agent is instructed to dynamically append or provision a new MCP server, it **MUST** follow this sequence to guarantee successful registration and structural discovery:

1. **Identify the Server Command:** Target the exact executable binary string or execution chain (e.g., `npx -y package-name`) required to initialize the server over standard I/O.
2. **Register the Gateway Entry:** Append the new server entry block directly into the `~/.config/mcpx/config.toml` directory.
   * *Note:* Because this file resides outside the active workspace directory root, agents must use precise `echo` or standard `cat << 'EOF'` redirection strings via execution shells to safely modify it.
3. **Verify the Integration Health:** Execute `mcpx-rust list` followed immediately by `mcpx-rust <new_server> --help` to verify the routing engine maps the tool schema cleanly.
4. **Update Project Context:** Add a summary of the new server's syntax and operational profile to `AGENTS.md` (or the relevant local run-book) so subsequent execution turns are instantly aware of the expanded capabilities.
