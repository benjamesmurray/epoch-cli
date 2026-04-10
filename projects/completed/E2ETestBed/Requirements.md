# E2ETestBed - Requirements Document

Holistic test bed for configuring, monitoring, and evaluating E2E variance tests. Handles loop detection, timeouts, and metrics reporting.

## Core Features

- **Test Configuration Engine:** A declarative configuration system (e.g., JSON/YAML) to easily define test runs, prompts, iterations, timeouts, and expected evaluation criteria.
- **Robust Process Management:** Run tests in isolated subprocesses with strict timeout enforcements. Automatically kill stalled or looping runs to ensure the holistic test suite never freezes midway.
- **Advanced Failure Heuristics & Loop Detection:** Real-time log monitoring to detect infinite tool-calling loops, failure to utilize expected MCP servers (like Spec CLI), and syntax/build errors, categorizing the failure mode explicitly.
- **Monitoring & Observability:** Real-time console output mapping the progress of multiple test runs without terminal spam, potentially providing a unified dashboard or structured log output.
- **Evaluation & Reporting:** Aggregate statistics into a structured variance report (Markdown/JSON) containing metrics like total runs, success/failure ratios, failure categories, and average execution times.

## User Stories

- As a Tool Developer, I want to configure a suite of coding challenges, so that I can automatically test the AI's success rate and adherence to behavioral rules.
- As an Agent Evaluator, I want the test bed to automatically detect and kill stalled/looping agents, so that a 10-iteration test doesn't freeze permanently on iteration 2.
- As a Maintainer, I want detailed failure mode categorization (e.g., "Ignored Spec CLI", "Syntax Error", "Infinite Loop"), so that I can easily investigate and resolve specific behavioral regressions.

## Acceptance Criteria

- [ ] A configuration schema exists to define test scenarios, parameters, and assertions.
- [ ] The test harness can execute multiple test iterations sequentially or in parallel.
- [ ] If an agent enters an infinite loop or exceeds the timeout, its specific subprocess is terminated without aborting the entire test suite.
- [ ] The harness parses agent output logs to determine if `mcp-spec-cli` was utilized and evaluates whether the code passed `bun test`.
- [ ] At the end of the test suite, a comprehensive Markdown variance report is generated detailing successes, specific failure modes, and durations.

## Non-functional Requirements

- **Workspace Isolation:** The test bed codebase (the harness itself) will reside in `/home/benmurray/Projects/cli/e2e_testing/harness`. However, the test harness must execute the LLM agents within a completely separate evaluation directory (`/home/benmurray/Projects/epochclievaluations`). This evaluation sandbox must be fully configured with its own `epochcli` configuration and MCP server setups to ensure all tooling is available to the agents being evaluated, without polluting the main CLI repository.
- **Reliability:** The test harness itself must never crash due to a child process failure or malformed agent output.
- **Extensibility:** The failure heuristics module should be pluggable so new failure patterns can be easily added over time.