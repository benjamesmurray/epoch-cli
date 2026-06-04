# Windows & VS Code Setup Guide

This guide provides step-by-step instructions for setting up the Epoch CLI and its required Model Context Protocol (MCP) servers on a Windows machine using Visual Studio Code.

## Phase 1: Prerequisites

Before installing the CLI, you must install the underlying runtimes and build tools.

### 1. Git
Install Git for Windows if you haven't already.
- Download: [gitforwindows.org](https://gitforwindows.org/)

### 2. Node.js & NPM
Required for fallback dependency handling and general package execution.
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

> **Important:** After installing Bun and Rust, close all open terminals and open a **new** PowerShell terminal (or restart VS Code) to ensure your environment variables are completely refreshed.

### 1. Install MCP Servers

Use Cargo to fetch and compile the unified router and the core ecosystem tools globally:

```powershell
cargo install mcpx-rust project-map-cli-rust ground-truth-cli-rust deliver-cli
```

### 2. Install Epoch CLI

Use Bun to globally install the CLI interface:

```powershell
bun install -g @packages/epochcli/dist/@epoch-ai/cli-windows-x64-baseline.zip
```

---

## Phase 3: Configuring MCP Servers

`mcpx-rust` evaluates paths cross-platform and looks for configuration files relative to the user profile.

### 1. Set the HOME Environment Variable (If Required)

If your version of `mcpx-rust` relies on the UNIX-style `HOME` variable rather than native Windows directory resolution, run the following in PowerShell to explicitly bridge it to your Windows User Profile:

```powershell
[Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")
```

*Note: You must restart your terminal session/VS Code after running this system change.*

### 2. Create the Configuration File

1. In PowerShell, generate the required config directory structure:

```powershell
   mkdir -Force $env:USERPROFILE\.config\mcpx
```

2. Create the blank configuration file:

```powershell
   New-Item -Force $env:USERPROFILE\.config\mcpx\config.toml
```

3. Open the file instantly in VS Code to edit:

```powershell
   code $env:USERPROFILE\.config\mcpx\config.toml
```

4. Paste the following setup into `config.toml` and save (`Ctrl + S`):

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

1. **Open your target development project** in VS Code.
2. Open the **Integrated Terminal** (`Ctrl + \``).
3. Ensure your active profile is set to **PowerShell** or **Git Bash**.

### Verification

Run these diagnostic commands to confirm the paths and routing are completely operational:

```powershell
# Verify Epoch CLI is accessible globally
epochcli --version

# Confirm mcpx can map and interact with your compiled Rust extensions
mcpx-rust list
```
