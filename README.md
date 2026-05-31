# Epoch CLI

Epoch CLI is a tool for software development that coordinates local AI models to handle complex tasks. It focuses on managing context window limits and maintaining a structured engineering workflow.

## Technical Approach

### Agent Personas and Orchestration
The system distinguishes between functional **personas** (what the agent can do) and orchestrational **roles** (how the environment is managed). These can be executed by a single high-performance model or split across multiple models to optimize for latency and cost.

#### Agent Personas
- **Plan**: Focused on research and design. Authorized for architectural discovery and drafting specifications but restricted from modifying source code.
- **Build**: The implementation state. Once a design is formally approved, the agent is elevated to this persona, gaining write access to implement code, run tests, and execute shell commands.

#### Orchestration Roles (Clerk & Supervisor)
- **Clerk**: Manages the development lifecycle, including context compaction (Epochs), intent classification, and the semantic merging of discovered rules into project memory.
- **Supervisor**: Monitors for "Stall Scoring" (repetitive failures or logic loops) and enforces behavioral constraints through targeted technical interventions.

#### Dual-Model Support
The system can be configured to use **llama-swap**, a proxy that automatically loads and unloads models in VRAM, to split these roles across a larger **Main Model** (for reasoning/coding) and a smaller **Side Model** (for background orchestration).

### Positional Prompting and Rules
The system uses a **Positional Prompt Architecture** to organize information based on model attention curves. Prompts are structured into four zones:
- **Zone 1 (Head)**: Immutable operational facts, environment constraints, and thinking control tokens.
- **Zone 2 (Body)**: Behavioral rules and language-specific patterns (including code snippets) extracted from the **Ground Truth** server.
- **Zone 3 (Tail)**: Project-specific anchors and active cursor context.
- **Zone 4 (Guidelines)**: High-priority instructions from `AGENTS.md`.

Architectural awareness is maintained by a background event bus that refreshes the project map index whenever files are modified, ensuring accurate discovery via tools.
- **Credit:** This approach is adapted from [The Architecture of Prompt Sequencing](https://atlassc.net/2026/03/30/the-architecture-of-prompt-sequencing).

### Tool Management (MCPX)
Instead of sending every available tool definition with every request, the CLI uses an adapted version of **MCPX**. This provides a single tool interface that the model uses to discover and execute other tools on demand, reducing the number of tokens used by the "tools" array.
- **Credit:** Adapted from [lydakis/mcpx](https://github.com/lydakis/mcpx).

### Specification Workflow
The CLI enforces a deterministic development sequence: **Requirements -> Design -> Tasks -> Implementation**. This ensures the agent has a verified plan before it begins writing code.
- **Credit:** Adapted from [kingkongshot/specs-workflow-mcp](https://github.com/kingkongshot/specs-workflow-mcp).

### TOON Data Format
For large datasets like file trees or linter logs, the CLI uses **TOON (Token-Oriented Object Notation)** instead of JSON. This format uses YAML-style indentation to reduce the number of tokens required to represent structured data.
- **Credit:** [toon-format/toon](https://github.com/toon-format/toon).

### Session Continuity
When a model reaches its context limit, the **Clerk** generates a dense summary of the current state (`.epoch-continuity.toon`) and archives the detailed history in a `.history/` directory. This allows a new session to start with a clear understanding of the project's progress.
- **Details:** See [continuity.md](docs/continuity.md).

### Loop Protection
The system tracks "stall scores" for agent actions. If an agent repeats the same tool call, fails multiple times, or generates repetitive text, the **Supervisor** interrupts the loop and provides a technical directive to change strategy.
- **Details:** See [doom_protection.md](docs/doom_protection.md).

### Code Manipulation
The system uses a streamlined version of **opencode** for reading and editing files.
- **Credit:** [anomalyco/opencode](https://github.com/anomalyco/opencode).

## Integrated Tools
The system relies on several Rust-based MCP servers for project awareness and task management:
- [mcpx-rust](https://crates.io/crates/mcpx-rust): Unified tool routing.
- [project-map-cli-rust](https://crates.io/crates/project-map-cli-rust): Architectural mapping and symbol discovery.
- [ground-truth-cli-rust](https://crates.io/crates/ground-truth-cli-rust): Project-specific rule enforcement.
- [deliver-cli](https://crates.io/crates/deliver-cli): Specification and task tracking.

## Getting Started

Epoch CLI requires a few core components to be fully functional, including the TypeScript-based CLI and several Rust-based MCP servers for architectural mapping and rule enforcement.

### 1. Prerequisites
- **Bun**: The runtime for Epoch CLI. [Install Bun](https://bun.sh/).
- **Rust/Cargo**: Required to install the essential MCP servers. [Install Rust](https://www.rust-lang.org/tools/install).

### 2. Install Essential MCP Components
Run the following commands to install the necessary Rust-based tools:
```bash
# Unified MCP routing engine
cargo install mcpx-rust

# Essential servers for mapping, rules, and specifications
cargo install project-map-cli-rust
cargo install ground-truth-cli-rust
cargo install deliver-cli
```

### 3. Install Epoch CLI
You can install Epoch CLI globally using Bun:
```bash
bun install -g @epoch-ai/cli
```

### 4. Configuration
Epoch CLI is configured via `.epochcli/epochcli.jsonc`. You also need to configure your MCP servers in `~/.config/mcpx/config.toml` so `mcpx-rust` knows how to call them.

Example `config.toml` for essential servers:
```toml
[mcp_servers.map]
command = "project-map-cli-rust"
args = ["mcp"]

[mcp_servers.ground]
command = "ground-truth-cli-rust"
args = ["mcp"]

[mcp_servers.spec]
command = "deliver-cli"
args = ["mcp"]
```

### 5. Usage
Once installed and configured, you can start the interactive TUI by running:
```bash
epochcli
```

## License
MIT
