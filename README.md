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

### 🛡️ MCP Routing & Hallucination Defense
To reclaim context budget and prevent agentic drift, Epoch CLI enforces strict role-based tool filtering:
- **Role-Based Filtering**: Instead of injecting all MCP schemas globally (~8,000 tokens), the orchestrator injects only the "Tool Pack" relevant to the active agent (e.g., only Spec tools during planning). This reduces overhead by up to 85%.
- **Structural Defense**: High-priority directives are injected into **Zone 1** of the prompt, explicitly restricting the model to the tools defined in its current schema, effectively neutralizing "Ghost Tool" hallucinations.
- **Inheritance**: Subagents automatically inherit the tool set of their parent, ensuring consistent execution during parallel tasks.
- **Persona Lock (One-Shot)**: For autonomous scaffolding, the system implements a filesystem-aware lock that pins the agent to `plan` until the planning documents are officially approved, preventing premature implementation shifts.

### 🏛️ Three Pillar MCP Architecture
The CLI achieves "functional consciousness" and architectural awareness entirely through its deep integration with three core MCP servers:
- **`mcp-spec-cli`**: Drives rigorous, specification-based workflows (Requirements -> Design -> Tasks -> Implementation -> Testing).
- **`project-map-cli`**: Provides structural awareness. The agent can query symbols and explore relationships without reading massive files directly.
- **`ground-truth-cli`**: Scans the project to enforce codebase-specific rules and conventions via TOON (Token-Oriented Object Notation) formats.

### 💾 Positional Prompting & Managed Cold Starts
Epoch CLI utilizes a **Positional Prompt Architecture** to exploit the transformer's U-shaped attention curve:
- **Zone 1 (Head)**: Critical operational facts and hallucination defense.
- **Zone 2 (Body)**: Behavioral rule packs and general context.
- **Zone 3 (Tail)**: Fact reiteration and active cursor focus.
- **Managed Cold Starts**: Maintains an `.epoch-context.md` file via Spec CLI to act as short-term memory, allowing the system to wipe conversation history (Purge) without losing task continuity.

### 📊 Advanced Telemetry & E2E Testing
Includes a robust E2E variance testing harness that monitors:
- **Performance Metrics**: Real-time tracking of Tokens Per Second (TPS) and Time-To-First-Token (TTFT).
- **Architectural Validation**: Detailed logging of `activeAgent` transitions and `toolCount` reduction.
- **Stability Monitoring**: Automated tracking of JSON repair rates and loop detection interventions.

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime installed.
- Local LLM inference servers running (e.g., via vLLM or `llama.cpp`) on ports `8085` (main) and `8086` (side).

### Configuration
Epoch CLI is configured via the `.epochcli/epochcli.jsonc` file. Example configuration for local builds:

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
    "mcp-spec-cli": { 
      "type": "local", 
      "command": ["node", "/path/to/cli/mcp-spec-cli/dist/index.js"] 
    },
    "project-map-cli": { 
      "type": "local", 
      "command": ["/path/to/cli/project-map-cli/venv/bin/python", "-m", "project_map_cli.mcp.server"] 
    },
    "ground-truth-cli": { 
      "type": "local", 
      "command": ["npx", "-y", "https://github.com/benjamesmurray/ground-truth-cli"] 
    }
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
- [MCP Configuration Guide](docs/MCP_config_guide.md) - Detailed setup for tool servers.

## License
MIT
