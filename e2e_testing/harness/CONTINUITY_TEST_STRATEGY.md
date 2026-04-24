# Epoch Continuity E2E Integration Strategy

## Objective
Prove the stability, reliability, and observability of the new asynchronous `.epoch-continuity.md` refactor by forcing the `local-main` model to operate under an artificially constrained context window (5,000 tokens) during a complex, multi-stage implementation task.

## 1. Test Configuration (`test_config_continuity.json`)
Create a new configuration file in `e2e_testing/harness/`.
```json
[
  {
    "id": "eventbus-v2-continuity",
    "iterations": 3,
    "timeoutMs": 1200000, 
    "prompt": "Use the spec tool to initialize a new project called 'eventbus' in one-shot mode. Create a design for a strictly typed EventBus in TypeScript and then implement it with tests.",
    "expectedTools": ["sc_init", "sc_todo_start", "sc_todo_complete", "task_complete"],
    "runTargetDir": ".epochcli/tool/$RUN_ID",
    "epochcli": {
      "mcpx": { "enabled": true }
    },
    "docker": {
      "imageName": "epochcli-eval-env:latest",
      "network": "host",
      "memoryLimit": "4g",
      "model": "local-main/gemma-4-26b-q4-xl",
      "contextOverride": 5000 
    }
  }
]
```

## 2. Harness Enhancements

### A. Context Constraint Injection (`WorkspaceBuilder.ts`)
Modify `WorkspaceBuilder.buildDockerWorkspace` to support the `contextOverride` property. When generating the `epochcli.jsonc` file for the docker container, it should inject:
```json
"models": {
  "gemma-4-26b-q4-xl": { 
      "name": "Gemma 4 26B",
      "limit": { "context": 5000 } 
  }
}
```

### B. Epoch Observability (`HeuristicsEngine.ts`)
Update the `HeuristicsEngine` to explicitly track Epoch transitions:
*   **Watch for Signature Logs:** Monitor the streamed `run.log` for: `"Context limit reached. Initiating automatic Epoch transition."`
*   **Metrics:** Add a `totalEpochs` counter to the metrics payload.

### C. Artifact Preservation (`AgentRunner.ts`)
To verify the Supervisor's narrative quality, we need to inspect the generated reports.
*   **Snapshotting:** Whenever the `HeuristicsEngine` detects an Epoch transition, the `AgentRunner` should execute a background `docker cp` (or equivalent file read from the mounted volume) to capture the current state of `.epoch-continuity.md` and save it to the host's `suite_[timestamp]/eventbus-v2-continuity-[run]/continuity_epoch_[N].md`.
*   This ensures we have a longitudinal audit trail of exactly what the Supervisor generated at every 5k boundary.

## 3. Evaluation Criteria

The test harness evaluator will determine success based on the following:
1.  **Completion:** The agent autonomously finishes the task (YOLO mode concludes) without crashing or looping infinitely.
2.  **Epoch Triggers:** The `totalEpochs` metric is `> 1` (proving the 5k limit was breached and successfully handled).
3.  **Compilation & Tests:** The final output in the target workspace successfully compiles and passes its own tests (`bun test`), proving that architectural context wasn't lost during the transitions.
4.  **Reporting:** The `variance_report.md` will now include an `Avg Epochs / Run` column.

## 4. Execution Workflow
1. Build the updated Harness: `cd e2e_testing/harness && bun run src/index.ts --config test_config_continuity.json --yolo`
2. Review the isolated `continuity_epoch_1.md` files in the results directory to evaluate the `local-side` model's ability to accurately summarize the `EventBus` architecture mid-flight.