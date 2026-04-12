# rules-context-optimization - Testing & Verification

## Automated Testing

1. Execute `cd packages/epochcli && bun test test/session/llm.test.ts`.
2. Verify that the following test cases pass:
   - `session.llm.parseGroundTruthRules > extracts and formats operational facts correctly`: Confirms metadata stripping.
   - `session.llm.parseGroundTruthRules > filters behavioral rules based on active agent pack`: Confirms dynamic filtering for `build` and `explore`.
   - `session.llm.parseGroundTruthRules > falls back to raw text when markers are missing`: Confirms safety.

## Manual Verification

- [x] Verified that the `parseGroundTruthRules` function is called in `llm.ts` with the `activeAgent` parameter in both the Clerk block and the main payload block.
- [x] Verified the regex patterns against the actual `.assistant_rules.toon` file content.
- [x] Confirmed via unit tests that the resulting strings are dense and token-efficient.

The implementation is verified and all tests pass.
