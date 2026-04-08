#!/bin/bash

# Configuration
E2E_DIR="/home/benmurray/Projects/cli/e2e_testing"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_DIR="$E2E_DIR/${TIMESTAMP}_roaster_test"
EPOCHCLI_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/index.ts"
LOG_PARSER_CMD="bun /home/benmurray/Projects/cli/packages/epochcli/src/util/log-parser.ts"

echo "=================================================="
echo "Starting E2E Roaster Test: $TIMESTAMP"
echo "=================================================="

# 1. Create Evidence Directory
mkdir -p "$TEST_DIR"
echo "[1/4] Created evidence directory: $TEST_DIR"

# 2. Cleanup Previous Artifacts
echo "[2/4] Cleaning up previous artifacts..."
rm -rf "/home/benmurray/Projects/cli/.epochcli/tool/roaster"
rm -rf "/home/benmurray/Projects/cli/projects/completed/roaster"
rm -rf "/home/benmurray/Projects/cli/projects/active/roaster"

# 3. Define the One-Shot Prompt
PROMPT="Use the Spec CLI to initialize a new project called 'roaster' in one-shot mode. Build a TypeScript utility in .epochcli/tool/roaster. The utility should read the local project map, construct a prompt, and make an HTTP request to our local LLM at http://localhost:8085/v1/chat/completions to write a roast blog article about the codebase. Include a test suite using 'bun test' and a README. DO NOT ask for confirmation, just write the code."

# 4. Execute Epoch CLI and pipe logs
echo "[3/4] Executing Epoch CLI autonomously. This will take several minutes..."
echo "      Logs are being piped to: $TEST_DIR/run.log"

export LOG_LEVEL="INFO"
# We pipe both stdout and stderr because LLM tools and logger emit to both
$EPOCHCLI_CMD run "$PROMPT" > "$TEST_DIR/run.log" 2>&1

echo "[4/4] Execution complete. Gathering evidence..."

# 5. Gather Evidence
# Copy Source Code
if [ -d "/home/benmurray/Projects/cli/.epochcli/tool/roaster" ]; then
    cp -r "/home/benmurray/Projects/cli/.epochcli/tool/roaster" "$TEST_DIR/roaster_source"
    echo "  -> Copied Roaster source code."
else
    echo "  -> WARNING: Roaster source code not found."
fi

# Copy Spec Artifacts
if [ -d "/home/benmurray/Projects/cli/projects/completed/roaster" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/completed/roaster" "$TEST_DIR/spec_artifacts"
    echo "  -> Copied completed Spec artifacts."
elif [ -d "/home/benmurray/Projects/cli/projects/active/roaster" ]; then
    cp -r "/home/benmurray/Projects/cli/projects/active/roaster" "$TEST_DIR/spec_artifacts"
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
# E2E Test Run: Roaster Utility
**Timestamp:** $TIMESTAMP

## 1. Tool Orchestration Analysis
*Did the agent correctly use sc_init (one-shot), pm_query, and file writing tools without hanging?*

## 2. Dual-Model Efficiency Analysis
*Did LogParserTool verify that the baton passes occurred successfully without overlap?*

## 3. Code Quality Analysis
*Does the generated TypeScript code compile? Are the tests passing? Did it successfully make the HTTP call to the local LLM?*

## Conclusion

EOF

echo "=================================================="
echo "E2E Test Complete!"
echo "Evidence stored in: $TEST_DIR"
echo "=================================================="
