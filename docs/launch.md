bun run --cwd packages/epochcli dev

  Or, if you are running directly from the entry point:

bun run --conditions=browser packages/epochcli/src/index.ts

  The --conditions=browser flag is important for the TUI's SolidJS runtime.