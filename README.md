# Epoch CLI

Epoch CLI is a tool for software development that coordinates local AI models to handle complex tasks. It focuses on managing context window limits and maintaining a structured engineering workflow.

## Getting Started

Epoch CLI requires a few core components to be fully functional, including the TypeScript-based CLI and several Rust-based MCP servers for architectural mapping and rule enforcement.

### Quick Setup Guides

For the best setup experience, follow the guide specific to your platform and IDE:

*   [**Windows & VS Code**](docs/windows_vscode_guide.md)
*   [**macOS & JetBrains IDE**](docs/mac_jetbrains.md)

---

### Core Installation (General)

1.  **Prerequisites**: Install [Bun](https://bun.sh/) and [Rust/Cargo](https://www.rust-lang.org/tools/install).
2.  **Install MCP Servers**:
    ```bash
    cargo install mcpx-rust project-map-cli-rust ground-truth-cli-rust deliver-cli
    ```
3.  **Install Epoch CLI**:
    ```bash
    bun install -g @epoch-ai/cli
    ```
4.  **Configure**: Set up your servers in `~/.config/mcpx/config.toml` (See [MCP Config Guide](docs/MCP_config_guide.md)).
5.  **Run**:
    ```bash
    epochcli
    ```

---

## Technical Approach

### Agent Personas and Orchestration
The system distinguishes between functional **personas** (what the agent can do) and orchestrational **roles** (how the environment is managed).

#### Agent Personas
- **Plan**: Focused on research and design. Authorized for architectural discovery and drafting specifications but restricted from modifying source code.
- **Build**: The implementation state. Gaining write access to implement code, run tests, and execute shell commands.

#### Orchestration Roles
- **Clerk**: Manages the development lifecycle, context compaction (Epochs), and semantic merging of discovered rules.
- **Supervisor**: Monitors for "Stall Scoring" (repetitive failures) and enforces behavioral constraints through targeted technical interventions.

### Positional Prompting and Rules
The system uses a **Positional Prompt Architecture** (Zone 1-4) to organize information based on model attention curves, utilizing the **Ground Truth** server for project-specific behavioral rules.
- **Credit:** Adapted from [The Architecture of Prompt Sequencing](https://atlassc.net/2026/03/30/the-architecture-of-prompt-sequencing).

### Tool Management (MCPX)
Uses a multiplexing proxy to discover and execute tools on demand, drastically reducing token bloat in the "tools" array.
- **Credit:** Adapted from [lydakis/mcpx](https://github.com/lydakis/mcpx).

### Specification Workflow
Enforces a deterministic sequence: **Requirements -> Design -> Tasks -> Implementation**.
- **Credit:** Adapted from [kingkongshot/specs-workflow-mcp](https://github.com/kingkongshot/specs-workflow-mcp).

---

## Documentation Index

Explore our in-depth guides for architecture, configuration, and workflows:

### Setup & Configuration
*   [**MCP Server Configuration**](docs/MCP_config_guide.md) - Registering and routing MCP servers.
*   [**Model Configuration**](docs/model_config.md) - Tuning LLM parameters and swap behavior.
*   [**NPM Publishing**](docs/npm_publish.md) - Guide for maintainers.

### Architecture & Workflows
*   [**Spec-Driven Development**](docs/spec-driven-development.md) - Detailed guide on the R-D-T-I sequence.
*   [**Sub-Agents**](docs/sub_agents.md) - How specialized agents are invoked.
*   [**Continuity & Epochs**](docs/continuity.md) - Managing long-running sessions across context resets.
*   [**Loop Protection**](docs/doom_protection.md) - Technical details of Stall Scoring and Supervisor interventions.

### Advanced Topics
*   [**Project Constitution**](docs/branding.md) - Project-level identity and behavioral anchors.
*   [**Telemetry Overview**](docs/telemetry_overview.md) - How usage and failure data is tracked.
*   [**TOON Format**](docs/toon_format.md) - Token-Oriented Object Notation specification.

---

## Integrated Tools
The system relies on several Rust-based MCP servers:
- [mcpx-rust](https://crates.io/crates/mcpx-rust): Unified tool routing.
- [project-map-cli-rust](https://crates.io/crates/project-map-cli-rust): Architectural mapping.
- [ground-truth-cli-rust](https://crates.io/crates/ground-truth-cli-rust): Project-specific rules.
- [deliver-cli](https://crates.io/crates/deliver-cli): Task tracking.

## License
MIT
