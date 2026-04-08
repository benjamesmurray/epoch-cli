# Epoch CLI

Epoch CLI is an advanced, Agent-Native command-line interface designed to orchestrate complex development workflows using a novel **Dual-Model Architecture** and the **Model Context Protocol (MCP)**.

It is built to maximize the efficiency of local LLMs by intelligently routing tasks, strictly managing context windows via "Task-Epochs", and leveraging specialized external tools to explore and manipulate codebases without wasting context tokens.

## Key Features

### 🧠 Dual-Model Orchestration
Epoch CLI seamlessly coordinates between two local language models to prevent compute contention and optimize performance:
- **`local-main` (e.g., 26B parameters)**: The heavy-lifter. Responsible for complex reasoning, code generation, and executing primary user directives (Phase 2).
- **`local-side` (e.g., 4B parameters)**: The agile assistant. Operates in the background to sanitize inputs, repair broken JSON outputs from the main model, extract persistent architectural rules (Phase 1), and summarize completed tasks (Phase 3).

### 🔌 Model Context Protocol (MCP) Integration
The CLI is deeply integrated with MCP servers to extend the agent's capabilities:
- **`mcp-spec-cli`**: Drives a rigorous, specification-based workflow (Requirements -> Design -> Tasks -> Implementation -> Testing). Features an autonomous `one-shot` mode for uninterrupted execution.
- **`project-map-cli`**: Provides architectural awareness. The agent can query symbols, explore relationships, and understand the codebase structure without reading massive files directly.
- **`ground-truth-cli`**: Scans the project to enforce codebase-specific rules and conventions via TOON (Token-Oriented Object Notation) formats.

### 📊 Advanced Telemetry & Auto-Recovery
- Emits structured JSON telemetry (`START_GENERATE`, `END_GENERATE`) tracking Time-to-First-Token (TTFT), Tokens Per Second (TPS), and Token Usage.
- Implements **Positional Prompt Truncation** (Token U-Shape) to preserve critical task instructions (Zone 1) and immediate context (Zone 3) while safely truncating older history (Zone 2) when approaching the 32K context limit.
- **Self-Healing**: Automatically catches context overflow errors, compacts the conversation history, and resumes execution seamlessly.

### 🧪 Automated E2E Testing Framework
Includes a robust end-to-end testing script (`e2e_testing/run_roaster_e2e.sh`) that forces the agent to autonomously plan, implement, and test a complex utility, subsequently analyzing the logs to definitively prove zero compute overlap between the dual models.

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime installed.
- Local LLM inference servers running (e.g., via LM Studio or `llama.cpp`) on ports `8085` (main) and `8086` (side).

### Configuration
Epoch CLI is configured via the `.epochcli/epochcli.jsonc` file in your workspace. 

Ensure your local providers and MCP servers are mapped correctly:

```jsonc
{
  "provider": {
    "local-main": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://localhost:8085/v1" }
    },
    "local-side": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://localhost:8086/v1" }
    }
  },
  "mcp": {
    "mcp-spec-cli": { "type": "local", "command": ["node", "mcp-spec-cli/dist/index.js"] },
    "project-map-cli": { "type": "local", "command": ["project-map-cli/venv/bin/python", "project-map-cli/src/project_map_cli/mcp/server.py"] },
    "ground-truth-cli": { "type": "local", "command": ["node", "ground-truth-cli/dist/index.js"] }
  }
}
```

*For more details on setting up MCP tools, see the [MCP Configuration Guide](docs/MCP_config_guide.md).*

### Usage

Start the interactive TUI:
```bash
bun packages/epochcli/src/index.ts
```

Run an autonomous, one-shot command:
```bash
bun packages/epochcli/src/index.ts run "Use the Spec CLI to initialize a new project called 'example' in one-shot mode."
```

Check MCP Server status:
```bash
bun packages/epochcli/src/index.ts mcp ls
```

## Documentation

- [GEMINI.md](GEMINI.md) - Workspace instructions and architecture overview.
- [MCP Configuration Guide](docs/MCP_config_guide.md) - Guide to connecting external tools.
- [E2E Testing Strategy](projects/active/dual-model-orchestration/Testing.md) - Deep dive into the telemetry and validation metrics.

## License
MIT
