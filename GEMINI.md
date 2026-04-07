# Gemini CLI Workspace Instructions

This workspace is configured with several Model Context Protocol (MCP) servers. When operating in this project, leverage the following tools to enhance your capabilities:
t

## 1. GitHub MCP Server (`github`)

- **Purpose:** Allows direct interaction with GitHub repositories, issues, pull requests, and Actions.
- **When to use:** Use this server's tools to read remote repository code, fetch issue details, create/update pull requests, or check CI/CD workflow status.

## 2. Project Map CLI (`project-map-cli`)

- **Purpose:** Provides a contextually efficient architectural map of the local project.
- **When to use:** Invoke this tool when you need to understand the project structure, file dependencies, or system-wide layout without wasting context on exhaustive manual directory listings or file reads. Create new projects here: /home/benmurray/Projects/cli/Projects/Active
- **Tools:**
  - **`mcp_project-map-cli_sc_exec`**: Accepts a CLI string to search symbols or check impact (e.g., `find --query User`, `impact --fqn com.example.UserService`).
  - **`mcp_project-map-cli_sc_status`**: Returns current workspace context and available commands for the project map.
  - **`mcp_project-map-cli_sc_help`**: Gets documentation for project map commands.
  - **`mcp_project-map-cli_sc_verify`**: Checks workspace state.

## 3. Spec CLI (`mcp-spec-cli`)

- **Purpose:** Manages intelligent, specification-driven development workflows.
- **When to use:** Use these tools to structure feature development and track progress.
- **Tools:**
  - **`mcp_mcp-spec-cli_sc_exec`**: Use for core actions like initializing a new feature (`init`), planning (`plan`), and managing tasks (`todo`).
  - **`mcp_mcp-spec-cli_sc_status`**: Use to check the current health of the spec and get explicit "Next Step" directives.
  - **`mcp_mcp-spec-cli_sc_verify`**: Use after making changes to validate that the last action was successful and aligns with the spec.
  - **`mcp_mcp-spec-cli_sc_help`**: Call this if you need deeper documentation on how to use the spec workflow tools.
