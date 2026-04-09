# Design

## Overview
The goal is to streamline the LLM system prompt sent to local models to reduce token overhead and remove generic/corporate bloat.

## Architecture & Modifications
The system prompt is assembled across three main components:

1. **Base Personas (`packages/epochcli/src/session/prompt/*.txt`):**
   - **`default.txt`:** Reduce verbosity. Remove links to `epochcli.ai` and GitHub issues. Compress the 7 examples down to 2 essential examples demonstrating brevity. Condense "Tone and style", "Proactiveness", and "Doing tasks" sections into shorter bullet lists.
   - **`gemini.txt`:** Similar compression to `default.txt` where applicable.

2. **Skills Boilerplate (`packages/epochcli/src/session/system.ts`):**
   - In `SystemPrompt.skills()`, currently the preamble about skills is returned unconditionally if the skills feature is enabled, followed by the skills list.
   - **Change:** Check if the `list` of skills is empty. If it is empty, return `undefined` or an empty string rather than injecting the "Skills provide specialized instructions..." text and "No skills are currently available."

3. **Environment Boilerplate (`packages/epochcli/src/session/system.ts`):**
   - In `SystemPrompt.environment()`, there is an empty `<directories>` block because directory tree generation is conditionally disabled (`false && ...`).
   - **Change:** Remove the `<directories>` tags completely to save tokens, as they are not currently being populated.

## Testing Strategy
- Once changes are made, run the CLI locally (e.g. `bun run dev run "Hi"`) and observe the generated system prompt or the telemetry logs to verify that:
  - Token count is significantly reduced.
  - The "Skills" text is absent.
  - The `<directories>` block is absent.
  - The core behavioral rules remain intact.
