# Bug Report: E2E Test Evaluator Fails with "No such object/container" Docker Errors

## Description
During the final evaluation phase of an E2E test run, the test harness attempts to boot a "Black-Box environment" to evaluate the code produced by the agent. However, Docker repeatedly throws `No such object` and `No such container` errors. This results in an immediate failure of the evaluation phase, even if the agent's code generation was successful.

## Error Logs
```text
  > Evaluating tests inside Docker (.)...
    > 📦 Booting Black-Box environment for bash start.sh...
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error: No such object: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
Error response from daemon: No such container: c51e00bbe55a410e9fd1f10d370d54fdbc8d60bf3b30fe427cf5a464db1f7f58
  > Result: Tests Failed
```

## Expected Behavior
The `TestEvaluator` should successfully spawn the Docker container, wait for the `startupCommand` (e.g., `bash start.sh`) to initialize, execute the test script (e.g., `evaluators/iot_eval.test.ts`), and cleanly report the pass/fail result before tearing down the container.

## Suspected Root Causes
1. **Premature Container Exit**: The container might be crashing or exiting immediately upon startup (possibly due to an error in `start.sh` or a failure to run the process in the foreground). If the container exits, subsequent `docker inspect` or `docker exec` calls by the evaluator will fail with "No such object".
2. **`--rm` Flag Race Condition**: If the container is started with the `--rm` flag and it exits quickly, the Docker daemon automatically deletes the container. The harness polling logic then tries to inspect a container ID that no longer exists.
3. **Lifecycle Management Bug**: There might be a race condition in `e2e_testing/harness/src/TestEvaluator.ts` where it attempts to query the container health or stream logs before verifying if the `docker run` process itself is still alive.

## Recommended Investigation Steps
1. Inspect `e2e_testing/harness/src/TestEvaluator.ts` focusing on the `bootBlackbox` or container startup logic.
2. Check how the container ID is parsed and whether the harness correctly handles immediate failures of the `docker run` command.
3. Consider removing `--rm` temporarily or adding `docker logs <container_id>` capture right after the process exits to surface the actual reason the black-box environment crashed.