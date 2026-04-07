# rebrand-to-epochcli - User Testing Plan

## Manual Testing Steps

1. **Verify Binary Rename:**
   - Navigate to the project root.
   - Run the built binary (it should be in `packages/epochcli/dist/epochcli-linux-x64/bin/epochcli` or similar after a build).
   - Run `./packages/epochcli/dist/epochcli-linux-x64/bin/epochcli --version`.
   - Verify it prints the version and the help text mentions "epochcli".

2. **Verify Environment Variables:**
   - Check the source code (e.g., `packages/epochcli/src/flag/flag.ts`) to ensure `EPOCHCLI_` prefixes are used.
   - Run `env | grep EPOCHCLI` if you have any set to verify they are picked up (optional).

3. **Verify Configuration Directory:**
   - Run `epochcli` (the built version).
   - Check if a `.epochcli` directory is created in your home directory (or equivalent for your OS).
   - Verify it contains `epochcli.jsonc` instead of `opencode.jsonc`.

4. **Verify Branding in CLI:**
   - Run `epochcli`.
   - Verify the ASCII art logo and wordmark display "EPOCH CLI".
   - Verify help text and logs refer to "Epoch CLI".

5. **Verify Workspace Consistency:**
   - Check `package.json` names and `@epoch-ai` scopes.
   - Verify `bun turbo build` and `bun turbo test:ci` still pass at the root.

## User Feedback

- (To be populated by user)
