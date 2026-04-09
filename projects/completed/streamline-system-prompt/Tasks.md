# Tasks

- [x] 1. Refactor `default.txt` Base Prompt
  - **Objective:** Edit `packages/epochcli/src/session/prompt/default.txt` to remove verbosity, external URLs, compress examples, and create concise bullets for behavioral rules.
  - **Target Files:** `packages/epochcli/src/session/prompt/default.txt`
  - **Dependencies:** None

- [x] 2. Refactor `gemini.txt` Base Prompt
  - **Objective:** Apply similar compression and bloat-reduction to `packages/epochcli/src/session/prompt/gemini.txt` as done in `default.txt`.
  - **Target Files:** `packages/epochcli/src/session/prompt/gemini.txt`
  - **Dependencies:** None

- [x] 3. Optimize Dynamic Skills Boilerplate
  - **Objective:** Modify `SystemPrompt.skills()` to only output the skills text and preamble if there are actually skills returned from `Skill.available(agent)`.
  - **Target Files:** `packages/epochcli/src/session/system.ts`
  - **Dependencies:** None

- [x] 4. Remove Empty `<directories>` Boilerplate
  - **Objective:** Modify `SystemPrompt.environment()` to completely remove the `<directories>` ... `</directories>` block to save tokens, since it is effectively disabled anyway.
  - **Target Files:** `packages/epochcli/src/session/system.ts`
  - **Dependencies:** None
