# Windows & VS Code Setup Guide

This guide provides step-by-step instructions for setting up the Epoch CLI and its required Model Context Protocol (MCP) servers on a Windows machine using Visual Studio Code.

## Phase 1: Prerequisites

Before installing the CLI, you must install the underlying runtimes and build tools.

### 1. Git
Install Git for Windows if you haven't already.
- Download: [gitforwindows.org](https://gitforwindows.org/)

### 2. Node.js & NPM
Required for some package management features and fallback dependencies.
- Download the LTS version from [nodejs.org](https://nodejs.org/).

### 3. Rust & Cargo
Required to compile and run the project's native MCP servers.
1. Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/).
2. *Note: Rust on Windows requires the Microsoft C++ Build Tools. The rustup installer will automatically prompt you to install them if they are missing.*

### 4. Bun
The primary JavaScript runtime for Epoch CLI.
Open a PowerShell terminal and run:
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 5. Visual Studio Code
Download and install from [code.visualstudio.com](https://code.visualstudio.com/).

---

## Phase 2: Installing Epoch CLI and MCP Servers

Once the prerequisites are installed, open a **new** PowerShell terminal (or VS Code integrated terminal) so your `PATH` environment variables are refreshed.

### 1. Install MCP Servers
Use Cargo (Rust's package manager) to install the unified router and the project's specific MCP servers. Because these are fetched from the central Rust registry (crates.io), **you can run this command from any directory**:

```powershell
cargo install mcpx-rust project-map-cli-rust ground-truth-cli-rust deliver-cli
```

### 2. Install Epoch CLI
Use Bun to globally install the CLI:

```powershell
bun install -g @epoch-ai/cli
```

---

## Phase 3: Configuring MCP Servers

`mcpx-rust` requires a configuration file to know how to route commands to the individual MCP servers. On Windows, this lives in your user profile directory.

### 1. Set the HOME Environment Variable
`mcpx-rust` (being cross-platform) requires the `HOME` environment variable to be explicitly set on Windows. Run the following in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")
```
*Note: You must restart your terminal session after running this command.*

### 2. Create the Configuration File
1. In PowerShell, create the configuration directory:
   ```powershell
   mkdir -Force $env:USERPROFILE\.config\mcpx
   ```
2. Create the configuration file:
   ```powershell
   New-Item -Force $env:USERPROFILE\.config\mcpx\config.toml
   ```
3. Open this file in VS Code:
   ```powershell
   code $env:USERPROFILE\.config\mcpx\config.toml
   ```
4. Paste the following configuration into `config.toml` and save the file:

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

## Phase 4: VS Code Integration & Usage

1. **Open your project** in VS Code.
2. Open the **Integrated Terminal** (`Ctrl + \``).
3. Set your default terminal profile to **PowerShell** or **Git Bash** (Epoch CLI works well in both).

### Verification
Run the following commands in the terminal to ensure everything is wired up correctly:

```powershell
# Check that Epoch CLI is installed
epochcli --version

# Check that the MCP router sees your configured servers
mcpx-rust list
```

If both commands return successfully, your Windows environment is fully configured for Spec-Driven Development with Epoch CLI.