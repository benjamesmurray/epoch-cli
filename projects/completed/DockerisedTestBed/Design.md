# DockerisedTestBed - Design Document

## Overview

The `DockerisedTestBed` migrates the LLM agent execution phase from a shared host directory (`epochclievaluations`) into isolated, ephemeral Docker containers (`epochcli-eval-env`). This ensures a 100% pristine filesystem for every run and allows strict network isolation (`--network none`), preventing the agent from relying on external, unmocked internet access. The core MCP servers will be pre-installed inside the image to guarantee availability without internet access.

## Architecture

1.  **Image Builder (Pre-requisite):** A shell script (`build-eval-image.sh`) creates a Docker image (`epochcli-eval-env:latest`) containing Bun, Node.js, Python 3, and Git. It globally installs the three critical MCP servers (`mcp-spec-cli`, `project-map-cli`, `ground-truth-cli`).
2.  **Dockerized AgentRunner:** Replaces the `bun spawn` call in the current harness. Instead, it executes:
    `docker run --rm --network none -v <host_run_dir>:/workspace epochcli-eval-env epochcli run "$PROMPT"`
3.  **Local Workspace Mounts:** Before `docker run` is called, the harness creates an empty directory on the host (`/home/benmurray/Projects/epochclievaluations/<runId>`) and mounts it to `/workspace` in the container.
4.  **Isolated Configuration:** The mounted `/workspace` is seeded by the harness with a `.gemini/settings.json` configured specifically for the container (e.g., using `node /usr/lib/node_modules/mcp-spec-cli/dist/index.js` instead of `npx -y`).
5.  **Evaluator:** The `TestEvaluator` runs `bun test` on the host side by targeting the `targetDirRaw` inside the mounted host folder after the container exits, or optionally inside a quick ephemeral test container.

## Components and Interfaces

*   `Dockerfile.eval`: The definition of the pristine environment.
    *   *Base:* Ubuntu/Debian.
    *   *Installs:* `bun`, `node`, `python3`, `npm i -g @benjamesmurray/mcp-spec-cli`, `npm i -g @benjamesmurray/ground-truth-cli`. Python venv for `project-map-cli`.
*   `AgentRunner.ts`: Modified to accept a `DockerConfig` object (image name, network mode, volume mounts). Spawns the `docker run` process, preserving the streaming logic to the `HeuristicsEngine`.
*   `index.ts`: Modifies the pre-cleanup phase. Instead of clearing one shared `projects/active`, it creates a unique `workspace_$RUN_ID` directory, writes the container-specific `settings.json`, and passes this path to the `AgentRunner`.

## Data Models

```typescript
// Additions to types.ts
export interface DockerConfig {
  imageName: string;
  network: "none" | "host" | "bridge";
  memoryLimit: string; // e.g. "4g"
}

export interface TestConfig {
  // Existing fields...
  docker?: DockerConfig; // Optional flag to trigger Docker execution
}
```

## Error Handling

*   **Docker Failures:** If `docker run` fails to start (e.g., image missing, daemon down), the spawn exception is caught, and the run is marked as `"Error"` with the stderr output.
*   **Loop/Timeout Kills:** The `AgentRunner` uses `AbortController` against the spawned `docker` process. Sending `SIGKILL` to the `docker run` CLI command correctly terminates the child container because we will pass the `--rm` flag.

## Testing Strategy

*   **Unit Tests:** Mock the `spawn` command in `AgentRunner.test.ts` to ensure the constructed `docker run` arguments match the required volume mounts and network flags.
*   **End-to-End:** Run the eventbus config against the new `DockerisedTestBed` to confirm the agent successfully connects to the pre-installed MCP servers and executes without internet access.
