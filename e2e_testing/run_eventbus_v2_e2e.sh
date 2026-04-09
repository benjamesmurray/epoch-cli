#!/bin/bash

# Configuration
E2E_DIR="/home/benmurray/Projects/cli/e2e_testing"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_DIR="$E2E_DIR/${TIMESTAMP}_eventbus_v2_test"
EPOCHCLI_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/index.ts"
LOG_PARSER_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/util/log-parser.ts"

echo "=================================================="
echo "Starting E2E EventBus v2 Test: $TIMESTAMP"
echo "=================================================="

# 1. Create Evidence Directory
mkdir -p "$TEST_DIR"
echo "[1/4] Created evidence directory: $TEST_DIR"

# 2. Cleanup Previous Artifacts
echo "[2/4] Cleaning up previous artifacts..."
rm -rf "/home/benmurray/Projects/cli/.epochcli/tool/eventbus-v2"
rm -rf "/home/benmurray/Projects/cli/projects/completed/eventbus-v2"
rm -rf "/home/benmurray/Projects/cli/projects/active/eventbus-v2"

# 3. Define the One-Shot Prompt
PROMPT="Use the Spec CLI to initialize a new project called 'eventbus-v2' in one-shot mode. Design an advanced, strictly typed Transactional Event Sourcing Bus where the allowed events and payload types are defined by a TypeScript interface. Core Requirements: 1. Strict Typing & Wildcards: The on and emit methods must be strictly typed. Include support for a once subscription and a wildcard listener (*). 2. Asynchronous Middleware Pipeline: Before an event reaches its subscribers, it must pass through an asynchronous middleware pipeline (e.g., bus.use(async (ctx, next) => { ... })). Middleware should be able to mutate the payload, delay the event, or cancel it entirely by throwing an error or not calling next(). 3. Transactions & Rollbacks: Implement a bus.transaction() method that executes a callback containing multiple emit calls. If any middleware or subscriber throws an error during the transaction, the entire transaction fails, and a special rollback event must be emitted containing the original payloads of the events that were successfully processed before the failure. 4. Replay History: The bus must keep an immutable history of the last 50 successful events. Implement a bus.replay(subscriber) method that immediately fires the history into a newly attached subscriber. Build this TypeScript utility in .epochcli/tool/eventbus-v2. Include a test suite using 'bun test' that explicitly tests the middleware cancellation and the transaction rollback logic. Include a README."

# 4. Execute Epoch CLI and pipe logs
echo "[3/4] Executing Epoch CLI autonomously. This will take several minutes..."
echo "      Logs are being piped to: $TEST_DIR/run.log"

export LOG_LEVEL="INFO"
# We pipe both stdout and stderr because LLM tools and logger emit to both
$EPOCHCLI_CMD run "$PROMPT" > "$TEST_DIR/run.log" 2>&1

echo "[4/4] Execution complete. Gathering evidence..."

# 5. Gather Evidence
# Copy Source Code
if [ -d "/home/benmurray/Projects/cli/.epochcli/tool/eventbus-v2" ]; then
    cp -r "/home/benmurray/Projects/cli/.epochcli/tool/eventbus-v2" "$TEST_DIR/eventbus-v2_source"
    echo "  -> Copied EventBus v2 source code."
else
    echo "  -> WARNING: EventBus v2 source code not found."
fi

# Copy Spec Artifacts
if [ -d "/home/benmurray/Projects/cli/projects/completed/eventbus-v2" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/completed/eventbus-v2" "$TEST_DIR/spec_artifacts"
    echo "  -> Copied completed Spec artifacts."
elif [ -d "/home/benmurray/Projects/cli/projects/active/eventbus-v2" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/active/eventbus-v2" "$TEST_DIR/spec_artifacts"
    echo "  -> Copied active (uncompleted) Spec artifacts."
else
    echo "  -> WARNING: Spec artifacts not found."
fi

# Run Log Parser
echo "Running LogParserTool against telemetry..."
$LOG_PARSER_CMD "$TEST_DIR/run.log" > "$TEST_DIR/parser_results.txt" 2>&1
echo "  -> Parsed logs and saved to parser_results.txt."

# Create empty Analysis Report
cat << EOF > "$TEST_DIR/E2E_Analysis_Report.md"
# E2E Test Run: EventBus v2 (Transactional Event Sourcing)
**Timestamp:** $TIMESTAMP

## 1. Tool Orchestration Analysis
*Did the agent correctly use sc_init (one-shot) and file writing tools without hanging?*

## 2. Advanced Generics & Typing
*Does the solution use \`keyof T\` and mapped types effectively to provide full autocomplete for the EventBus?*
*Is the middleware pipeline properly typed (e.g. \`next()\` chaining)?*

## 3. Asynchronous Middleware Pipeline
*Does a failure in a middleware successfully prevent downstream subscribers from firing?*
*Are the events processed asynchronously correctly?*

## 4. State Management & Concurrency (Transactions)
*If multiple events are emitted in a transaction, and one fails, do the previously successful events trigger a rollback?*
*Does the \`rollback\` event fire with the correct historical payload data?*

## 5. Advanced Memory & Ring Buffers (Replay)
*Did the agent correctly implement a bounded array (max 50 events) for the history?*
*Does the \`replay()\` method correctly dispatch history to a newly attached subscriber?*

## 6. Code Quality & Testing
*Does the generated TypeScript code compile? Are the tests passing?*
*Did the test suite explicitly cover the complex middleware cancellation and transaction rollback logic?*

## Conclusion

EOF

echo "=================================================="
echo "E2E Test Complete!"
echo "Evidence stored in: $TEST_DIR"
echo "=================================================="
