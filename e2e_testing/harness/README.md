# Epoch CLI Test Harness Execution Engine

This sub-directory contains the TypeScript execution engine (`bun run src/index.ts`) for the end-to-end variance testing harness.

## Container Specifications

The tests run inside ephemeral Docker containers (`epochcli-eval-env`) built via `build-image.sh`. The container environment simulates a clean, isolated local developer machine with the following specs:

- **Base OS**: Debian Bookworm (`node:22-bookworm`)
- **Runtime Dependencies**:
  - Node.js v22
  - Bun (latest)
  - Python 3 + pip
  - Git
- **Offline MCP Servers**:
  - `ground-truth-cli` (installed globally via npm)
  - `mcp-spec-cli` (installed globally from local source snapshot)
  - `project-map-cli` (installed globally in a dedicated python virtual environment)
- **Baseline Context Files**: The container has `.assistant_rules.toon`, `AGENTS.md`, and `.editorconfig` baked into `/etc/epochcli/`.
- **CPU Limits**: Unbounded by default, runs on the host CPU.
- **Memory Limits**: Bounded by the `memoryLimit` specified in `test_config.json` (e.g., `4g` for 4 Gigabytes).
- **Disk Space**: Uses the host Docker overlay filesystem. The isolated run directory is mounted from the host at `/workspace` and is fully read-write.
- **Host Codebase**: The entire CLI codebase (`/home/benmurray/Projects/cli`) is mounted read-only (`:ro`) into the container at `/cli`. This allows the agent to run the absolute latest, uncommitted local code without needing to rebuild the Docker image for every typescript change.

## Launching from Host vs Container

The harness itself runs on the *host* machine (via `bun run src/index.ts`), but it orchestrates and kicks off the actual test execution *inside* the Docker container using `docker run`.

When a test scenario includes the `"docker"` configuration block in `test_config.json`, the harness will:
1. Generate an isolated directory for the specific test run on the host.
2. Create an isolated `.epochcli/epochcli.jsonc` file that configures the agent to connect to the host's LLM server (via `host.docker.internal`).
3. Spawn a `docker run` process that executes `bun /cli/packages/epochcli/src/index.ts run ...` inside the container.

If the `"docker"` block is omitted, the test simply runs directly on the host machine in a temporary folder. This is useful for rapid debugging of the harness logic itself, but Docker mode should be used for all formal evaluations to ensure isolation and accurate baseline contexts.