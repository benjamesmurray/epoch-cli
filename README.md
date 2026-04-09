# Epoch CLI

Epoch CLI is an advanced, Agent-Native command-line interface designed to orchestrate complex development workflows using a novel **Dual-Model Architecture**.

It is built to maximize the efficiency of local LLMs by intelligently routing tasks, strictly managing context windows via "Task-Epochs", and leveraging specialized external tools to explore and manipulate codebases without wasting context tokens.

## Key Features

### 🧠 Dual-Model Orchestration & Loop Supervisor
Epoch CLI seamlessly coordinates between two local language models to prevent compute contention and optimize performance:
- **`local-main` (e.g., 26B parameters)**: The heavy-lifter. Responsible for complex reasoning, code generation, and executing primary user directives.
- **`local-side` (e.g., 4B parameters)**: The agile supervisor. Operates in the background to sanitize inputs, repair broken JSON outputs, extract persistent architectural rules, and **monitor the main model for hallucination loops**. If the main model gets stuck repeating identical tool calls, the side model intercepts and generates a stern, dynamic correction to pivot its strategy.

### 🏛️ Three Pillar MCP Architecture
The CLI achieves "functional consciousness" and architectural awareness entirely through its deep integration with three core MCP servers:
- **`mcp-spec-cli`**: Drives rigorous, specification-based workflows (Requirements -> Design -> Tasks -> Implementation -> Testing). Features an autonomous `one-shot` mode for uninterrupted execution.
- **`project-map-cli`**: Provides structural awareness. The agent can query symbols, explore relationships, and understand the codebase layout without reading massive files directly.
- **`ground-truth-cli`**: Scans the project to enforce codebase-specific rules and conventions via TOON (Token-Oriented Object Notation) formats, directly injected into the prompt.

### 💾 Epoch Continuity & Managed Cold Starts
To navigate strict context window limits (e.g., 32k tokens) without losing the thread of complex tasks, Epoch CLI employs **managed cold starts**. 
- The `mcp-spec-cli` server maintains an `.epoch-context.md` file that acts as the agent's short-term memory. 
- Using the `sc_epoch` tool, the agent continuously tracks its active focus, pending intentions, hypotheses, and open questions.
- If the context window fills up or the session is restarted, the system can perform a "cold start" by wiping the conversation history, but the agent instantly regains its functional consciousness by reading the `.epoch-context.md` file injected into the very top of its new prompt.

### ⚡ Ultra-Streamlined System Prompt
The system prompt has been aggressively compressed to the theoretical minimum required for tool execution and basic formatting (e.g., specific rules for Gemma 4). By stripping out verbose role-playing, redundant examples, and conversational "fluff," the agent saves over 2,000 tokens of overhead per turn. This drastically improves Time-To-First-Token (TTFT) and maximizes the context window available for actual codebase reasoning.

### 🧪 Automated E2E Testing Framework
Includes robust end-to-end testing scripts (e.g., `e2e_testing/run_eventbus_v2_e2e.sh`) that force the agent to autonomously plan, implement, and test complex TypeScript utilities. The framework subsequently analyzes the telemetry logs to prove zero compute overlap, verify typing constraints, and monitor JSON repair rates.

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime installed.
- Local LLM inference servers running (e.g., via LM Studio or `llama.cpp`) on ports `8085` (main) and `8086` (side).

### Configuration
Epoch CLI is configured via the `.epochcli/epochcli.jsonc` file in your workspace. Ensure your local providers and MCP servers are mapped correctly:

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
    "mcp-spec-cli": { "type": "local", "command": ["npx", "-y", "https://github.com/benjamesmurray/mcp-spec-cli"] },
    "project-map-cli": { "type": "local", "command": ["project-map-cli/venv/bin/python", "project-map-cli/src/project_map_cli/mcp/server.py"] },
    "ground-truth-cli": { "type": "local", "command": ["npx", "-y", "https://github.com/benjamesmurray/ground-truth-cli"] }
  }
}
```

### Usage

Start the interactive TUI:
```bash
bun packages/epochcli/src/index.ts
```

Run an autonomous, one-shot command:
```bash
bun packages/epochcli/src/index.ts run "Use the Spec CLI to initialize a new project called 'example' in one-shot mode."
```

## Documentation
- [MCP Configuration Guide](docs/MCP_config_guide.md) - Guide to connecting external tools.
- [Epoch Spec](docs/Epoch_spec.md) - Deep dive into the orchestration specification.

## License
MIT