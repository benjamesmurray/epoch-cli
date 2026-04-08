# streamline-codebase - Design Document

## Architecture

- The system will be modified in-place by removing packages and modules.
- `packages/desktop` and `packages/web` will be physically deleted from the file system.
- `packages/epoch/src/provider` will retain only `local.ts` or `openai.ts` and related core files.
- `packages/epoch/src/share` will be completely removed.
- Appropriate configuration files (`package.json`, `tsconfig.json`) references will be updated.

## Data Models

- No new data models.

## API Endpoints

- Endpoints related to sharing sessions will be removed or disabled in `packages/epoch/src/server/routes` if applicable.

## Components

- Removed: Desktop electron GUI.
- Removed: Web frontend UI components.
- Removed: Telemetry and Session Sharing capabilities.