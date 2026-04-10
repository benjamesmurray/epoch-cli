# gemma-4-dual-model - User Testing Plan

## Manual Testing Steps

1. **Verify SanitizerMiddleware Integration:**
   - Modify or start an epochcli session with a local provider (`local-main` / `local-side`).
   - Intentionally prompt the model to return malformed tool calls (e.g., using `json` markdown instead of raw JSON, or missing closing brackets/tags).
   - *Expected:* The CLI should successfully intercept, repair the payload mid-stream, and execute the tool without halting the agent. You should see `json_repaired: true` in the resulting telemetry logs.

2. **Verify Telemetry & Truncation (LoggingInterceptor):**
   - Start an epochcli process using `local-main` and review the generated JSON logs (via stdout or `test-logs-tmp`).
   - Check the `START_GENERATE` and `END_GENERATE` events.
   - *Expected:*
     - Events include `mainEpochId` and optionally `clerkMicroEpochId`.
     - The `payload` object contains `zone1_critical_rules` and `zone3_active_cursor`.
     - The `zone2_context_files` should contain the exact string `"...[ZONE 2 TRUNCATED FOR LOGGING]"`.

3. **Verify Proactive Context Management:**
   - Fill a session with large amounts of context to push `promptTokens` near the 32,000 High Watermark (85% = ~27,200).
   - Trigger a new turn.
   - *Expected:* The model should be instructed to wrap up its state. The telemetry `START_GENERATE` log should show the "CRITICAL: Context limit approaching..." wrap-up directive prepended inside `zone1_critical_rules`.

4. **Verify the "Baton Pass" and UI-Blocking Queue:**
   - Trigger a generation (Phase 2).
   - Upon completion, quickly type and send a new prompt *before* the background Phase 3 (Archivist/Summary) finishes.
   - *Expected:* The CLI should safely queue your next prompt until Phase 3 finishes, preventing VRAM contention or data races.

## User Feedback

*(Waiting for user execution and feedback...)*
