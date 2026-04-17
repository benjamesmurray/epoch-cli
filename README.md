# Epoch CLI

Epoch CLI is an advanced, Agent-Native command-line interface designed to orchestrate complex development workflows using a novel **Dual-Model Architecture**.

It is built to maximize the efficiency of local LLMs by intelligently routing tasks, strictly managing context windows via "Task-Epochs", and leveraging specialized external tools to explore and manipulate codebases without wasting context tokens.

## Key Features

### 🧠 Dual-Model Orchestration & Conversational Supervisor
Epoch CLI seamlessly coordinates between two local language models using a "Baton Pass" event loop:
- **`local-main` (e.g., 26B parameters)**: The execution lead. Responsible for complex reasoning, code generation, and primary task fulfillment.
- **`local-side` (e.g., 4B parameters)**: The **Conversational Supervisor**. Analyzes a structural transcript of the conversation history (including tool calls) to manage environment state and persona discipline.
- **Agent Routing & Persona Inertia**: The supervisor dynamically selects the active **Agent Persona** (`build`, `plan`, `explore`) based on semantic progress. It maintains "Persona Inertia," ensuring shifts only occur when logical phases are complete or the agent is fundamentally blocked.
- **Arbitration Mechanism**: Empowering the main model to challenge environmental pruning. Through the `object_to_supervisor` tool, the main agent can object to a persona assignment. A circuit breaker ensures that persistent objections from the 26B model overrule the 4B supervisor to prevent deadlocks.

### 🛡️ mcpx Unified Tool Routing
To reclaim context budget and prevent agentic drift, Epoch CLI utilizes the **mcpx** utility to route all Model Context Protocol (MCP) interactions:
- **Zero-Schema Bloat**: Instead of injecting all MCP schemas globally (~8,000 tokens), the orchestrator injects only a single `mcpx` tool schema. This reduces static overhead by up to 95%.
- **Syntax Enforcement**: The agent is strictly governed by the syntax `mcpx <server> <tool> --flag=value`. This leverages Gemma 4's strong coding logic to reason about CLI outputs and compose shell-based tool chains (e.g., `mcpx github search | jq`).
- **Role-Based Filtering**: The `mcpx` tool is dynamically filtered based on agent persona permissions, ensuring strict execution boundaries.

### 🏛️ Three Pillar MCP Architecture (via mcpx)
The CLI achieves "functional consciousness" and architectural awareness entirely through its integration with core MCP servers routed via `mcpx`:
- **`mcp-spec-cli`**: Drives rigorous, specification-based workflows (Requirements -> Design -> Tasks -> Implementation -> Testing).
- **`project-map-cli`**: Provides structural awareness. The agent can query symbols and explore relationships without reading massive files directly.
- **`ground-truth-cli`**: Scans the project to enforce codebase-specific rules and conventions via TOON (Token-Oriented Object Notation).

### 💾 Positional Prompting & Fact Anchoring
Epoch CLI utilizes a refined **Positional Prompt Architecture** to exploit the transformer's U-shaped attention curve, anchoring critical context at both ends of the window:
- **Zone 1 (Head - System Prompt)**: Anchors high-priority **Operational Facts** (context limits, mcpx syntax, environment) at the absolute beginning of the request.
- **Zone 2 (Middle - History Offloading)**: Static behavioral rules, style guides, and engineering tasks are offloaded to a **one-time `assistant` initialization message** in the conversation history. This saves ~1,000 tokens per turn.
- **Zone 3 (Tail - Reinforcement)**: Operational facts are reinforced in a dedicated `operationalFacts` field at the **absolute end of the JSON payload** (after the message history), ensuring critical rules are always in the model's immediate context.
- **Managed Cold Starts**: Maintains an `.epoch-context.md` file via the `mcpx mcp-spec-cli` bridge to allow the system to wipe conversation history (Purge) without losing task continuity.

### 📊 Advanced Telemetry & E2E Testing
Includes a robust E2E variance testing harness that monitors:
- **Performance Metrics**: Real-time tracking of Tokens Per Second (TPS) and Time-To-First-Token (TTFT).
- **Architectural Validation**: Detailed logging of `activeAgent` transitions, `toolCount` reduction, and full `tools` definition payloads.
- **Stability Monitoring**: Automated tracking of JSON repair rates, loop detection interventions, and "Doom Loop" test aborts.

#### 1. Epoch Log Analyzer (Recommended)
A robust, turn-aware diagnostic tool that audits intervention efficacy and composition failures from the test harness.
- **Location**: `epoch-log-analyzer/`
- **Features**: Detects Streaming Loop abortions, Phase Stagnation nudges, and MCPX Composition failures (invalid params, unknown arguments).
- **Usage**:
  ```bash
  cd epoch-log-analyzer
  bun run src/index.ts <path_to_run.log>
  ```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime installed.
- [mcpx](https://github.com/lydakis/mcpx) installed globally (`npm install -g mcpx-go`).
- Local LLM inference servers running (e.g., via vLLM or `llama.cpp`) on ports `8085` (main) and `8086` (side).

### Configuration
Epoch CLI is configured via the `.epochcli/epochcli.jsonc` file. External MCP servers should be configured in `~/.config/mcpx/config.toml`.

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
  "mcpx": {
    "enabled": true,
    "binaryPath": "/usr/local/bin/mcpx" // Optional: defaults to global 'mcpx'
  }
}
```

### Usage

Start the interactive TUI:
```bash
bun packages/epochcli/src/index.ts
```

## Documentation
- [Epoch Spec](docs/Epoch_spec.md) - Deep dive into the orchestration specification.
- [MCP Configuration Guide](docs/MCP_config_guide.md) - Detailed setup for tool servers via `mcpx`.

## License
MIT
