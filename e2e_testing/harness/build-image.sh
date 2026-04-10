#!/bin/bash
set -e

# Run this from the root of the CLI repository so Docker can see the context files
cd "$(dirname "$0")/../.."

echo "Building epochcli-eval-env Docker image..."
docker build -t epochcli-eval-env:latest -f e2e_testing/harness/Dockerfile.eval .
echo "Build complete."
