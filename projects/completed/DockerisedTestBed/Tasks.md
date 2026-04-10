# DockerisedTestBed - Task List

## Implementation Tasks

- [ ] 1. **Create the Evaluation Dockerfile (`Dockerfile.eval`)**
  - *Goal*: Define the Docker environment with Bun, Node, Python, and the globally installed MCP servers.
  - *Files*: `e2e_testing/harness/Dockerfile.eval`
  - *Dependencies*: None
  - *Details*: Use a stable base image (e.g., `ubuntu:22.04` or `node:22-bullseye`). Install `bun`, `python3`, `python3-venv`. Then run `npm i -g @benjamesmurray/mcp-spec-cli @benjamesmurray/ground-truth-cli`. Setup the environment variable `PATH` to include the global bins.
  - *Requirement*: "A `Dockerfile.eval` exists that installs Bun, Node, Python, and pre-installs the three required MCP servers."

- [ ] 2. **Create the Image Builder Script**
  - *Goal*: Write a shell script or Bun script to automatically build the Docker image before test suites run.
  - *Files*: `e2e_testing/harness/build-image.sh` (or `build-image.ts`)
  - *Dependencies*: 1
  - *Details*: The script should run `docker build -t epochcli-eval-env:latest -f Dockerfile.eval .`.
  - *Requirement*: "The Docker image should be built once before the test suite starts"

- [ ] 3. **Update Data Models for Docker Config**
  - *Goal*: Add the `DockerConfig` interface to the types file.
  - *Files*: `e2e_testing/harness/src/types.ts`
  - *Dependencies*: None
  - *Details*: Add `docker?: { imageName: string, network: string, memoryLimit?: string }` to the `TestConfig` interface.
  - *Requirement*: "A `TestConfig` object allows optional Docker configuration."

- [ ] 4. **Refactor `AgentRunner` to support Docker spawn**
  - *Goal*: Modify the process manager to execute `docker run` when the config dictates, instead of a direct `bun spawn`. Incorporate the host CLI mount and a cleanup command for file permissions.
  - *Files*: `e2e_testing/harness/src/AgentRunner.ts`, `e2e_testing/harness/test/AgentRunner.test.ts`
  - *Dependencies*: 3
  - *Details*: If `config.docker` is present, construct a command like `['docker', 'run', '--rm', '--network', config.docker.network, '-v', \`/home/benmurray/Projects/cli:/cli:ro\`, '-v', \`\${cwd}:/workspace\`, '-w', '/workspace', config.docker.imageName, '/bin/bash', '-c', 'epochcli run "$PROMPT" && chmod -R 777 /workspace']`. Keep the existing abort and stream logic intact.
  - *Requirement*: "`AgentRunner.ts` is refactored to execute `docker run --rm --network none -v <local_dir>:/workspace epochcli-eval-env epochcli run ...`"

- [ ] 5. **Generate Sandbox-Specific `settings.json`**
  - *Goal*: Ensure that when a workspace is mounted into Docker, the agent has a `.gemini/settings.json` configured to use the *offline* pre-installed MCP binaries, not the `npx` URLs.
  - *Files*: `e2e_testing/harness/src/index.ts` (or a helper `WorkspaceBuilder.ts`)
  - *Dependencies*: 4
  - *Details*: Before executing `runner.run()`, write a `.gemini/settings.json` into the `workspace_$RUN_ID` folder. The config must map `mcp-spec-cli` to `node /usr/local/bin/mcp-spec-cli` (or wherever it gets installed in the Docker container), completely dropping the `ghcr.io` GitHub config.
  - *Requirement*: "A `.gemini/settings.json` config for the container is created, pointing to the pre-installed local paths of the MCP servers rather than `npx`"

- [ ] 6. **Refactor `TestEvaluator` to run inside Docker**
  - *Goal*: Ensure `bun test` runs in the same environment as the agent, avoiding host/container mismatch issues.
  - *Files*: `e2e_testing/harness/src/TestEvaluator.ts`
  - *Dependencies*: 4
  - *Details*: Update `evaluate(cwd, dockerConfig?)` to wrap the `bun test` command in a `docker run` command using the same image and mounted volume, if Docker mode is active.
  - *Requirement*: "`TestEvaluator.ts` can still evaluate the generated code (either by running `bun test` on the mounted host directory or inside a new ephemeral container)."

- [ ] 7. **Wire up `index.ts` and Update Configurations**
  - *Goal*: Integrate the workspace builder logic and update `test_config.json` to utilize the new Docker pipeline.
  - *Files*: `e2e_testing/harness/src/index.ts`, `e2e_testing/harness/test_config.json`
  - *Dependencies*: 5, 6
  - *Details*: Update the main loop to use isolated directories like `/home/benmurray/Projects/epochclievaluations/workspace_$RUN_ID`. Add the `"docker": { "imageName": "epochcli-eval-env", "network": "none" }` block to `test_config.json`.
  - *Requirement*: "Each test run mounts a fresh, empty directory on the host to `/workspace` inside the container to capture artifacts"