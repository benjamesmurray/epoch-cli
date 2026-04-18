# Gemini CLI Workspace Instructions

This workspace is configured with several Model Context Protocol (MCP) servers. When operating in this project, leverage the following tools to enhance your capabilities:
t

## 1. GitHub MCP Server (`github`)

- **Purpose:** Allows direct interaction with GitHub repositories, issues, pull requests, and Actions.
- **When to use:** Use this server's tools to read remote repository code, fetch issue details, create/update pull requests, or check CI/CD workflow status.

## 2. Project Map CLI (`map`)

- **Purpose:** Provides a contextually efficient architectural map of the local project.
- **When to use:** Invoke this tool when you need to understand the project structure, file dependencies, or system-wide layout without wasting context on exhaustive manual directory listings or file reads. Create new projects here: /home/benmurray/Projects/cli/Projects/Active
- **Tools:**
  - **`pm_status`**: Returns current workspace context, last active project, and available commands.
  - **`pm_help`**: Accepts a topic/command (e.g., 'find') and returns the detailed help text.
  - **`pm_init`**: Initializes or refreshes the project map index. Use this after significant code changes.
  - **`pm_query`**: Search for symbols or get file context. Provide 'query' for symbol search or 'path' for file context.
  - **`pm_plan`**: Analyzes the architectural impact of a symbol. Useful for planning refactors or changes.
  - **`pm_verify`**: Checks the health of the project map system and recent indexing status.

## 3. Spec CLI (`spec`)

- **Purpose:** Manages intelligent, specification-driven development workflows via `@epoch-ai/deliver-cli`.
- **When to use:** Use these tools to structure feature development and track progress.
- **Tools:**
  - **`sc_status`**: Get a health check of the active project and next steps.
  - **`sc_verify`**: Validate that the last action worked and check consistency.
  - **`sc_init`**: Initialize a new feature specification in `projects/active/`.
  - **`sc_plan`**: Progress the workflow state. Automatically archives when finished.
  - **`sc_approve`**: Explicitly approve the current drafted phase after review.
  - **`sc_guidance`**: Get detailed behavioral instructions for the current state.
  - **`sc_todo_list`**: List all implementation tasks and their status.
  - **`sc_todo_start`**: Mark a specific task as being actively worked on.
  - **`sc_todo_complete`**: Mark a specific task as completed.
  - **`sc_epoch`**: Update the task-epoch context (focus, intentions, hypotheses, questions).
  - **`sc_feedback`**: Provide user feedback or answers to open questions.
  - **`sc_mode`**: Toggle project mode between `one-shot` and `step-through`.
  - **`sc_archive`**: Manually move the project to the `projects/completed/` folder.
  - **`sc_help`**: Learn how to use the tools and get deep documentation.

## 4. Ground Truth CLI (`ground`)

- **Purpose:** Scans the active project to synthesize a "Project Constitution" (TOON formatted). Ensures the AI agent operates using strict project-specific behavioral constraints, stack details, and architectural rules.
- **When to use:** Use this tool when onboarding to a new repository, bootstrapping a new agent session, or when you need explicit operational constraints generated for the current codebase.
- **Tools:**
  - **`gt_status`**: Orient the agent: returns current scanning state and findings.
  - **`gt_help`**: Pull deep documentation for a specific feature or command (e.g., 'scan').
  - **`gt_exec`**: The primary workhorse. Action format: [action] [resource] (e.g., `{"action": "scan", "resource": "."}`).
  - **`gt_refresh`**: Force a refresh of the project constitution rules.
