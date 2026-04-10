# Tasks: Clerk Pair Programmer (Edit Tool Reviewer)

- [x] 1. Implement `analyzeEditFailure` function.
  - Objective: Create a new utility function in `packages/epochcli/src/tool/edit.ts` (or a helper file) that takes the file content, oldString, and newString, and queries the `local-side` model for a contextual error correction.
  - Files: `packages/epochcli/src/tool/edit.ts`
  - Dependencies: None
- [x] 2. Integrate analysis into `edit.ts` error handling.
  - Objective: Catch the `notFound` condition inside the `execute` block of `edit.ts` (after calling the synchronous `replace` function). If `notFound` is true, invoke `analyzeEditFailure` and throw the resulting compressed message as an Error.
  - Files: `packages/epochcli/src/tool/edit.ts`
  - Dependencies: 1
- [x] 3. Implement Fallback Mechanism.
  - Objective: Ensure that if the `local-side` model is unavailable or times out (> 3000ms), the tool falls back to the current behavior of returning the 100-line preview dump.
  - Files: `packages/epochcli/src/tool/edit.ts`
  - Dependencies: 2
- [x] 4. Write Unit/Integration Tests.
  - Objective: Update `packages/epochcli/test/tool/edit.test.ts` to mock the Provider and verify that a failed edit correctly returns the compressed message from the side model instead of the raw file dump.
  - Files: `packages/epochcli/test/tool/edit.test.ts`
  - Dependencies: 3