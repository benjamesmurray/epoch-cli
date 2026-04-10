# robust-loop-detection - Requirements Document

Enhance loop detection to handle cases where arguments vary slightly (like different capitalizations) or general tool failure loops.

## Core Features

The system must detect and prevent the main LLM from entering a loop of repetitive or slightly modified tool calls (e.g., trying to read `requirements.md` and then `Requirements.md` repeatedly without success).
This expands upon the current loop detection which only looks for exact identical JSON arguments for the same tool.

- Loop detection should identify when a tool has failed sequentially.
- Loop detection should capture variations in arguments (like case changes) if the tool is failing.
- The supervisor middleware must intercept these loops and delegate to the `local-side` model for a stern, technical directive to break the hallucination loop.

## User Stories

- As an AI agent, I want to be stopped if I get stuck in a trial-and-error loop of file names or paths, so that I don't waste context tokens and can rethink my strategy.
- As a user, I want the side model to intervene during any kind of repetitive failure loop, not just perfectly identical argument loops.

## Acceptance Criteria

- [ ] Loop detection intercepts identical tool calls as before.
- [ ] Loop detection also intercepts repeated tool calls to the same tool that result in errors (e.g., file not found, schema errors) sequentially over a threshold (e.g., 3-5 times).
- [ ] The Side-Model Handoff is triggered to provide a stern directive.

## Non-functional Requirements

- Must maintain low latency for tool execution when not in a loop.
- Must not false-positive on valid sequential tool calls (like reading multiple different files successfully).
