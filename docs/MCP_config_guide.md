# Epoch CLI - MCP Configuration Guide

This guide explains how to configure and enable the Model Context Protocol (MCP) server tools within your Epoch CLI project. By setting up these servers in your `.epochcli` configuration, you empower your agent with powerful architectural mapping, workflow management, and ground-truth enforcement.

## The Configuration File

All MCP server configurations for a project are managed inside the `.epochcli/epochcli.jsonc` file. This file contains project-specific settings, including providers, models, permissions, and tool flags.

To enable the local MCP servers, you will add an `"mcp"` object to the root of this JSON document. The format expects the name of the server mapped to its connection configuration (e.g., `type: "local"` and the command used to run it).

### Example Configuration

Open your `/home/benmurray/Projects/cli/.epochcli/epochcli.jsonc` file and update the `"mcp"` section to include the three core CLI tools:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": { /* ... */ },
  "model": "local-main/gemma-4-26b-q4-xl",
  
  // Define your MCP servers here
  "mcp": {
    "mcp-spec-cli": {
      "type": "local",
      // Assumes mcp-spec-cli is compiled and linked/accessible
      "command": ["node", "mcp-spec-cli/dist/index.js"]
    },
    "project-map-cli": {
      "type": "local",
      // Python CLI using project-map-mcp entry point
      "command": ["python", "project-map-cli/src/project_map_cli/mcp/server.py"] 
      // (or however you execute your python virtual environment, e.g., ["uv", "run", "--directory", "project-map-cli", "project-map-mcp"])
    },
    "ground-truth-cli": {
      "type": "local",
      // Node.js application
      "command": ["node", "ground-truth-cli/dist/index.js"]
    }
  },

  "tools": {
    "github-triage": false,
    "github-pr-search": false
  }
}
```

*Note: Ensure that the paths in the `"command"` array correctly resolve to the compiled/executable entry points for each server relative to where you run Epoch CLI, or use absolute paths / globally installed binaries.*

## The Core MCP Tools

Once configured, the Epoch CLI will automatically connect to these servers on startup and expose their tools to the agent:

1. **`mcp-spec-cli`**: Manages specification-driven development workflows. It acts as an autopilot, tracking the state of your feature (Requirements -> Design -> Tasks -> Implementation -> Testing) and maintaining short-term context.
2. **`project-map-cli`**: Provides architectural awareness. Instead of wasting tokens reading the entire filesystem, the agent can query `pm_query` to find symbols, get localized file contexts, or plan refactoring impact.
3. **`ground-truth-cli`**: The project constitution tool. Scans the codebase to understand established architectural rules and dependencies, keeping the agent aligned with the project's conventions.

---

## Toggling "One-Shot" Mode in `mcp-spec-cli`

The `mcp-spec-cli` tool enforces a rigorous workflow loop. By default, it operates in **`step-through`** mode, meaning the agent will pause to ask for human approval at the end of each phase (e.g., after drafting requirements, or after designing).

If you want the agent to operate fully autonomously without waiting for human confirmation at each phase, you can toggle **`one-shot`** mode.

### How to Toggle One-Shot Mode

**1. When initializing a new project:**
When the agent starts a new feature, it calls the `sc_init` tool. You can instruct the agent to start in one-shot mode immediately:

```
Initialize a new feature called "auth-system" using one-shot mode.
```

The agent will then invoke the tool as:
`{"name": "auth-system", "mode": "one-shot"}`

**2. Mid-Project via `sc_mode`:**
If a project is already active and you decide you no longer want to approve each step, you can ask the agent to toggle the mode on the fly:

```
Switch the spec workflow to one-shot mode.
```

The agent will invoke the `sc_mode` tool:
`{"mode": "one-shot"}`

When `one-shot` mode is active, the `mcp-spec-cli` will automatically instruct the agent to resolve any ambiguities on its own, assume approval for the generated documents, and seamlessly jump from Requirements all the way to Implementation tasks!
