# robust-loop-detection - Testing & Verification

## Automated Tests

### Unit Tests
- [x] **Loop Detection Interception**: Verified that `LLM.interceptToolLoop` correctly identifies and intercepts both identical argument loops and sequential failure loops.
  - **Test File**: `packages/epochcli/test/session/loop-detection.test.ts`
  - **Results**: Both `intercepts sequential tool failures` and `intercepts identical argument loops` pass.

## Manual Verification Steps

1. **Reproduction of the "requirements.md" Loop**:
   - Set up a local environment with `local-main` (Gemma 27B) and `local-side` (Nemotron 4B).
   - Prompt the agent to read a file that doesn't exist (e.g., `requirements.md` when only `Requirements.md` exists).
   - Observe if the agent tries multiple variations (e.g., `requirements.md`, `Requirements.md`, `REQUIREMENTS.md`).
   - After the 3rd failed attempt, the `local-side` model should intervene with a stern directive like: "STOP trying to read variations of requirements.md. The file does not exist in the current directory. Check the file list and use the correct path or stop this approach."
   - The main model should then pivot its strategy.

2. **Identical Argument Loop**:
   - Prompt the agent in a way that causes it to call the same tool with the same arguments 3 times (e.g., `ls .`).
   - Verify that the 4th attempt is intercepted by the system.

## Results
- Automated tests: **PASS**
- Manual verification: **Pending user execution or autonomous confirmation if environment available.**
