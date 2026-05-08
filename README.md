# Epoch CLI

Epoch CLI is a tool for software development that coordinates local AI models to handle complex tasks. It focuses on managing context window limits and maintaining a structured engineering workflow.

## Technical Approach

### Dual-Model Architecture
The system uses two models:
- **Main Model**: A larger model (e.g., Qwen 35B or Gemma 26B) used for reasoning and generating code.
- **Side Model (Supervisor)**: A smaller, faster model used for background tasks like summarizing history and enforcing rules.

These models are managed by **llama-swap**, a proxy that automatically loads and unloads models in VRAM as the system switches between coding and supervision.

### Positional Prompting and Rules
Prompts are structured into four zones to place information where models are most likely to attend to it (the beginning and end of the message). Immutable facts and thinking tokens are placed in Zone 1 (the head), while project-specific rules and cursor context are placed in Zone 3 (the tail).
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
When a model reaches its context limit, the supervisor model generates a dense summary of the current state (`.epoch-continuity.toon`) and archives the detailed history in a `.history/` directory. This allows a new session to start with a clear understanding of the project's progress.
- **Details:** See [continuity.md](docs/continuity.md).

### Loop Protection
The system tracks "stall scores" for agent actions. If an agent repeats the same tool call, fails multiple times, or generates repetitive text, the supervisor model interrupts the loop and provides a technical directive to change strategy.
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
bun install -g epochcli
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
