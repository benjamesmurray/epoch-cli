# E2ETestBed - Task List

## Implementation Tasks

- [ ] 1. **Scaffold the Isolated Evaluation Workspace**
  - *Goal*: Create the separate directory (`/home/benmurray/Projects/epochclievaluations`) and bootstrap it with the necessary `epochcli` configurations (e.g., `epochcli.jsonc`, `.gemini/settings.json`) and MCP settings so that the agents have access to `mcp-spec-cli`, `project-map-cli`, and `ground-truth-cli`.
  - *Files*: `/home/benmurray/Projects/epochclievaluations/epochcli.jsonc`, etc.
  - *Dependencies*: None
  - *Details*: Use shell commands to create the directory and copy or generate the required configuration files from the main repo into the evaluation workspace.
  - *Requirement*: "The test bed must be built and run in a completely separate project directory... fully configured with its own epochcli configuration."

- [ ] 2. **Scaffold the Harness Project**
  - *Goal*: Create the foundational Bun project for the test harness within the main repository's e2e directory.
  - *Files*: `e2e_testing/harness/package.json`, `e2e_testing/harness/tsconfig.json`, `e2e_testing/harness/src/types.ts`
  - *Dependencies*: 1
  - *Details*: Initialize a new Bun project. Define `TestConfig` and `RunResult` interfaces based on the Design document.
  - *Requirement*: "A configuration schema exists to define test scenarios, parameters, and assertions."

- [ ] 3. **Implement HeuristicsEngine and Loop Detection**
  - *Goal*: Build the logic to analyze agent logs and detect infinite loops or missing Spec CLI usage.
  - *Files*: `e2e_testing/harness/src/HeuristicsEngine.ts`, `e2e_testing/harness/test/HeuristicsEngine.test.ts`
  - *Dependencies*: 2
  - *Details*: Implement `detectInfiniteLoop` (scanning for identical tool patterns) and `detectSpecCliUsage`. Write unit tests to verify behavior.
  - *Requirement*: "Real-time log monitoring to detect infinite tool-calling loops, failure to utilize expected MCP servers"

- [ ] 4. **Implement AgentRunner with Process Isolation and Timeouts**
  - *Goal*: Build the component that spawns the agent CLI via `bun spawn`, monitors stdout/stderr, and enforces timeouts.
  - *Files*: `e2e_testing/harness/src/AgentRunner.ts`, `e2e_testing/harness/test/AgentRunner.test.ts`
  - *Dependencies*: 2, 3
  - *Details*: Utilize `AbortController` to handle timeouts. Stream output to log files. Feed log lines incrementally to the `HeuristicsEngine`. Terminate process on timeout or loop detection. When spawning, MUST set `cwd` to `/home/benmurray/Projects/epochclievaluations`.
  - *Requirement*: "Run tests in isolated subprocesses with strict timeout enforcements. Automatically kill stalled or looping runs"

- [ ] 5. **Implement TestEvaluator**
  - *Goal*: Build the module that runs `bun test` inside the agent's generated workspace.
  - *Files*: `e2e_testing/harness/src/TestEvaluator.ts`, `e2e_testing/harness/test/TestEvaluator.test.ts`
  - *Dependencies*: 2
  - *Details*: Execute `bun test` in the target directory and parse the exit code. Handle `ENOENT` if the directory wasn't created.
  - *Requirement*: "evaluates whether the code passed `bun test`"

- [ ] 6. **Build Configuration Loader and Reporting Engine**
  - *Goal*: Read JSON configurations and output Markdown variance reports.
  - *Files*: `e2e_testing/harness/src/ConfigLoader.ts`, `e2e_testing/harness/src/Reporter.ts`
  - *Dependencies*: 2
  - *Details*: Read `test_config.json`. Aggregate `RunResult` data and write to `variance_report.md` mimicking the old bash output but richer.
  - *Requirement*: "A comprehensive Markdown variance report is generated detailing successes, specific failure modes, and durations."

- [ ] 7. **Wire up TestHarness (Main Entrypoint)**
  - *Goal*: Combine all modules into `index.ts` to execute the full matrix of tests.
  - *Files*: `e2e_testing/harness/src/index.ts`
  - *Dependencies*: 4, 5, 6
  - *Details*: Iterate through the config scenarios, instantiate `AgentRunner` sequentially or concurrently, run `TestEvaluator`, collect results, and generate the report.
  - *Requirement*: "The test harness can execute multiple test iterations sequentially or in parallel."
