# DockerisedTestBed - Requirements Document

Migrate the E2E Test Bed to execute agent evaluations inside ephemeral Docker containers. This ensures a pristine file system for every test iteration and enables strict network isolation (`--network none`) to prevent agents from relying on external un-mocked data.

## Core Features

- **Containerized Agent Environment:** A custom Docker image (`epochcli-eval-env`) containing Node.js, Bun, Python, and the three key locally hosted MCP servers (`mcp-spec-cli`, `project-map-cli`, `ground-truth-cli`).
- **Offline MCP Server Execution:** Since the container will have no network access, the MCP servers cannot rely on `npx -y` (which fetches from GitHub). They must be globally installed/cloned during the Docker image build phase.
- **Excluded GitHub Server:** The Docker environment will *not* configure or include the GitHub MCP server, as these are local coding challenges.
- **Ephemeral Workspaces:** Each test run mounts a fresh, empty directory on the host to `/workspace` inside the container to capture artifacts, ensuring zero state leakage between iterations.
- **Dockerized AgentRunner:** Update the `AgentRunner` to orchestrate `docker run` commands instead of local `bun spawn`, passing standard I/O to the existing `HeuristicsEngine` for loop and timeout detection.

## User Stories

- As an Evaluator, I want every test run to start with a pristine file system, so that artifacts from `run-1` do not accidentally solve the challenge for `run-2`.
- As a Tester, I want the agent container to run with `--network none`, so I can guarantee the model isn't "cheating" by fetching external snippets via curl or un-mocked APIs.
- As a Maintainer, I want the core MCP tools (`spec-cli`, `project-map`, `ground-truth`) pre-installed in the Docker image, so that the agent can execute tasks immediately without waiting for `npx` downloads.

## Acceptance Criteria

- [ ] A `Dockerfile.eval` exists that installs Bun, Node, Python, and pre-installs the three required MCP servers.
- [ ] A `.gemini/settings.json` config for the container is created, pointing to the pre-installed local paths of the MCP servers rather than `npx` or `docker run`.
- [ ] `AgentRunner.ts` is refactored to execute `docker run --rm --network none -v <local_dir>:/workspace epochcli-eval-env epochcli run ...`.
- [ ] `TestEvaluator.ts` can still evaluate the generated code (either by running `bun test` on the mounted host directory or inside a new ephemeral container).
- [ ] Infinite loop detection and timeouts still function correctly via the stdout/stderr stream parsing.

## Non-functional Requirements

- **Speed:** The Docker image should be built once before the test suite starts, keeping the per-iteration startup latency low.
- **Cleanliness:** All containers must be removed automatically after execution (`--rm`), leaving no dangling or zombie containers.