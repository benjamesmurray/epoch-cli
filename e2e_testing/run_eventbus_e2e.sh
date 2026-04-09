#!/bin/bash

# Configuration
E2E_DIR="/home/benmurray/Projects/cli/e2e_testing"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_DIR="$E2E_DIR/${TIMESTAMP}_eventbus_test"
EPOCHCLI_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/index.ts"
LOG_PARSER_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/util/log-parser.ts"

echo "=================================================="
echo "Starting E2E EventBus Test: $TIMESTAMP"
echo "=================================================="

# 1. Create Evidence Directory
mkdir -p "$TEST_DIR"
echo "[1/4] Created evidence directory: $TEST_DIR"

# 2. Cleanup Previous Artifacts
echo "[2/4] Cleaning up previous artifacts..."
rm -rf "/home/benmurray/Projects/cli/.epochcli/tool/eventbus"
rm -rf "/home/benmurray/Projects/cli/projects/completed/eventbus"
rm -rf "/home/benmurray/Projects/cli/projects/active/eventbus"

# 3. Define the One-Shot Prompt
PROMPT="Use the Spec CLI to initialize a new project called 'eventbus' in one-shot mode. Design an EventBus where the allowed events and their payload types are defined by a TypeScript interface. The on and emit methods must be strictly typed based on this interface. Include support for a once subscription and a 'wildcard' listener (*) that catches every event. Build a TypeScript utility in .epochcli/tool/eventbus. Include a test suite using 'bun test' and a README. DO NOT ask for confirmation, just write the code."

# 4. Execute Epoch CLI and pipe logs
echo "[3/4] Executing Epoch CLI autonomously. This will take several minutes..."
echo "      Logs are being piped to: $TEST_DIR/run.log"

export LOG_LEVEL="INFO"
# We pipe both stdout and stderr because LLM tools and logger emit to both
$EPOCHCLI_CMD run "$PROMPT" > "$TEST_DIR/run.log" 2>&1

echo "[4/4] Execution complete. Gathering evidence..."

# 5. Gather Evidence
# Copy Source Code
if [ -d "/home/benmurray/Projects/cli/.epochcli/tool/eventbus" ]; then
    cp -r "/home/benmurray/Projects/cli/.epochcli/tool/eventbus" "$TEST_DIR/eventbus_source"
    echo "  -> Copied EventBus source code."
else
    echo "  -> WARNING: EventBus source code not found."
fi

# Copy Spec Artifacts
if [ -d "/home/benmurray/Projects/cli/projects/completed/eventbus" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/completed/eventbus" "$TEST_DIR/spec_artifacts"
    echo "  -> Copied completed Spec artifacts."
elif [ -d "/home/benmurray/Projects/cli/projects/active/eventbus" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/active/eventbus" "$TEST_DIR/spec_artifacts"
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
# E2E Test Run: EventBus Utility
**Timestamp:** $TIMESTAMP

## 1. Tool Orchestration Analysis
*Did the agent correctly use sc_init (one-shot) and file writing tools without hanging?*

## 2. Advanced Generics & Typing
*Does the solution use \`keyof T\` and mapped types effectively to provide full autocomplete for the EventBus?*
*Are the \`on\` and \`emit\` methods strictly typed based on the interface?*

## 3. Memory Management
*Does the solution return an unsubscribe function when attaching a listener?*
*Does the solution successfully and correctly clean up \`once\` listeners after they fire?*

## 4. Wildcard Implementation
*How does it handle the "wildcard" type? Does it correctly union all possible payload types for the wildcard callback?*
*Does the implementation prevent emitting events that aren't defined in the schema?*

## 5. Code Quality & Testing
*Does the generated TypeScript code compile? Are the tests passing?*

## Conclusion

EOF

echo "=================================================="
echo "E2E Test Complete!"
echo "Evidence stored in: $TEST_DIR"
echo "=================================================="
