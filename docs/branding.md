# Brand Guidelines: Epoch CLI

This document outlines the standard naming conventions to be used across the codebase, documentation, and user interfaces to ensure consistency.

## 1. Product Name (Display Text)
- **Standard:** `Epoch CLI`
- **Usage:** UI text, terminal outputs, Markdown documentation text, titles, descriptions.
- **Rules:** Capitalize the 'E' in Epoch and all letters in 'CLI'. Include a space. Do not use "EpochCLI" or "epoch cli" in display contexts.

## 2. Command Line & Binaries
- **Standard:** `epochcli`
- **Usage:** The executable binary name, command-line usage examples, NPM package name for the CLI itself.
- **Rules:** All lowercase, single word, no hyphens.

## 3. Configuration & Filesystem
- **Standard:** `epochcli`
- **Usage:** Configuration files (`epochcli.json`), dot-directories (`.epochcli`), environment variables prefix (`EPOCHCLI_`).
- **Rules:** Match the command-line binary standard.

## 4. Package Scope / Internal Architecture
- **Standard:** `@epoch-ai`
- **Usage:** Internal monorepo package scope (`@epoch-ai/sdk`, `@epoch-ai/plugin`, `@epoch-ai/util`).
- **Rules:** Represents the overarching project/organization scope. Keep it as-is to avoid massive and unnecessary refactoring of the dependency tree.

## 5. Repository / Project Name
- **Standard:** `epochcli`
- **Usage:** Used for the main package directory (`packages/epochcli`) and git repository naming.

## Summary Table

| Context | Correct Usage | Incorrect Usage |
| :--- | :--- | :--- |
| UI & Documentation | Epoch CLI | EpochCLI, epoch cli, epoch-cli |
| Binary & CLI Command | `epochcli` | `epoch-cli`, `epoch cli` |
| Package Name (CLI) | `epochcli` | `epoch-cli` |
| Package Scope | `@epoch-ai` | `@epochcli`, `@epoch_cli` |
| Config Folders | `.epochcli` | `.epoch-cli`, `.EpochCLI` |
| Env Variables | `EPOCHCLI_*` | `EPOCH_CLI_*`, `EPOCH-CLI_*` |
