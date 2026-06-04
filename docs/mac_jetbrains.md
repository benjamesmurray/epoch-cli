# macOS & JetBrains IDE Setup Guide

This guide details how to install the Epoch CLI and its unified Model Context Protocol (MCP) gateway router on macOS, and integrate it as a single multiplexed server entry directly inside your JetBrains development environment.

---

## Phase 1: Prerequisites

Run these commands in your standard macOS Terminal to install the underlying Unix runtimes and build tools.

### 1. Homebrew & Xcode Command Line Tools

```bash
# Install Xcode compiler tools
xcode-select --install

# Install Homebrew (if you don't already have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Git, Node, and Bun

```bash
# Update Git and install Node.js
brew install git node

# Install Bun (the JavaScript runtime required for Epoch CLI)
curl -fsSL https://bun.sh/install | bash
```

### 3. Rust & Cargo

Required to compile and host your native Rust MCP servers and the `mcpx-rust` multiplexer.

```bash
# Install Rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

*Choose **Option 1** (Standard Installation) when prompted, then restart your terminal or run `source $HOME/.cargo/env` to load Cargo into your active session.*

---

## Phase 2: Installing Epoch CLI and MCP Servers

> **Important:** Close your terminal window and open a **new** one after installing Bun and Rust to ensure your system paths (`~/.cargo/bin` and `~/.bun/bin`) are completely active.

### 1. Install MCP Servers & Router

Use Cargo to download, compile, and install the unified router (`mcpx-rust`) along with your specific domain engines globally from crates.io:

```bash
cargo install mcpx-rust project-map-cli-rust ground-truth-cli-rust deliver-cli
```

### 2. Install Epoch CLI

Use Bun to globally register the central developer command line interface:

```bash
bun install -g @epoch-ai/cli
```
*(Note: If testing locally with baseline zips, ensure you point to the correct macOS distribution zip, e.g., `@packages/epochcli/dist/@epoch-ai/cli-darwin-x64-baseline.zip`)*

---

## Phase 3: Configuring the `mcpx-rust` Multiplexer

Because `mcpx-rust` acts as your single, unified gateway interface, you must give it a configuration profile detailing how to manage and spin up its underlying sub-servers.

1. Generate the required configuration directory structure inside your home directory:
   ```bash
   mkdir -p ~/.config/mcpx
   ```

2. Create the configuration file:
   ```bash
   touch ~/.config/mcpx/config.toml
   ```

3. Open and paste the following tool blocks into `~/.config/mcpx/config.toml`:
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

---

## Phase 4: JetBrains IDE Integration

JetBrains IDEs natively support standard input/output (STDIO) transport protocols for local MCP tools. Because `mcpx-rust` operates as a single multiplexed proxy server, you do not need to register individual sub-servers in your IDE settings. You only register the gateway.

### 1. Register the Unified Proxy Gateway
1. Open your JetBrains IDE (IntelliJ IDEA, WebStorm, PyCharm, CLion, etc.).
2. Open Settings via **`Cmd + ,`** (or navigate to **Preferences / Settings** -> **Tools** -> **AI Assistant** -> **Model Context Protocol (MCP)**).
3. Click the **Add (+)** button to introduce a new server row.
4. Configure the entry row using the `mcpx-rust` binary:
   * **Name:** `Epoch Gateway (mcpx)`
   * **Transport:** `STDIO`
   * **Command / Executable:** `mcpx-rust`
   * **Arguments:** *(Leave completely blank if your router targets standard input directly on execution, or append specific CLI server verbs like `serve` if required by your package)*
5. Click **Apply** and **OK**. 

The JetBrains AI Assistant will instantly trigger a single background process running `mcpx-rust`. When the IDE interrogates the proxy, `mcpx-rust` dynamically merges and reflects the toolsets of the underlying Spec Engine (`deliver-cli`), Ground Truth, and Project Map components as a single ecosystem interface.

### 2. Manual Epoch Orchestration
For working outside the IDE agent—such as initiating explicit spec-driven epochs, resetting state layers, or inspecting logs—tap **`Alt + F12`** to trigger the integrated JetBrains terminal window.

### Verification
Run these commands inside your integrated JetBrains terminal panel to verify paths, cross-tool communications, and configuration health:

```bash
# Verify the Epoch CLI interface is globally bound
epochcli --version

# Confirm the multiplexer correctly reads your config.toml mapping
mcpx-rust list
```
