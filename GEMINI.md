# Gemini CLI Workspace Instructions

This workspace is configured with several Model Context Protocol (MCP) servers, all unified under the `mcpx` tool. You MUST use the `mcpx` tool for all MCP operations.

## 1. Unified MCP Interface (`mcpx`)

- **Purpose:** A single, discoverable CLI interface for all MCP servers (github, map, spec, ground, etc.).
- **When to use:** Use this tool for ALL interactions with MCP servers. Do NOT use individual tools if they are exposed.
- **Workflow (AI Tool Syntax):**
  1. **Discover Tools:** Call `mcpx` with `server="<server>"` and `tool="--help"`.
  2. **Inspect Tool Schema:** Call `mcpx` with `server="<server>"`, `tool="<tool>"`, and `args=["--help"]`.
  3. **Execute:** Call `mcpx` with `server="<server>"`, `tool="<tool>"`, and any required `args` or `flags`.

- **Workflow (Manual Shell Syntax):**
  1. **Discover:** Run `mcpx-rust <server>` to list available tools.
  2. **Inspect:** Run `mcpx-rust <server> <tool> --help` to see the schema and flags.
  3. **Execute:** Run `mcpx-rust <server> <tool> --flag=value`.

## Tooling Integrity
- **MCPX Composition:** All interactions with external MCP servers (spec, map, ground, github) MUST use the structured `mcpx` JSON tool. Do NOT attempt to pass raw shell strings or shim commands into tool parameters.
- **Syntax Mapping:** Always decompose shim-style commands (e.g., `spec sc_status`) into their JSON components: `server="spec"`, `tool="sc_status"`. See `AGENTS.md` for mandatory mapping examples and discovery rules.

## Configured Servers

The following servers are available via `mcpx`:

1.  **`github`**: Interact with GitHub repositories, issues, and pull requests.
2.  **`map`**: Contextually efficient architectural map of the local project.
3.  **`spec`**: Intelligent, specification-driven development workflows.
4.  **`ground`**: Project Constitution and behavioral constraints scanning.

