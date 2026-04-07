# streamline-codebase - Requirements Document

Streamline the codebase by stripping GUI, web, remote providers, and telemetry for a terminal-native agentic loop.

## Core Features

- Remove GUI and web frontends.
- Strip out all remote providers except local ones (like OpenAI compatible/local).
- Remove sharing features and telemetry to ensure a pure local-first terminal CLI experience.

## User Stories

- As a user, I want the CLI to be completely local-first and terminal-only, so that I can use it efficiently on my local hardware with local LLMs.
- As a contributor, I want the codebase to be lean and free of unused dependencies like desktop frameworks (Electron/Tauri) and React-web code.

## Acceptance Criteria

- [ ] `packages/desktop` is completely removed.
- [ ] `packages/web` is completely removed.
- [ ] Remote providers inside `packages/epoch/src/provider` (and related files) are removed, leaving only OpenAI or Local provider.
- [ ] Telemetry and sharing logic (e.g., `packages/epoch/src/share`) is removed.

## Non-functional Requirements

- Performance: Reduce binary size and dependency tree footprint by ~40%.
- Security: Remove "Share Session" to prevent any phone-home or generation of public URLs.
- Compatibility: Ensure terminal loop execution remains flawless.