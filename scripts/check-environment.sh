#!/bin/bash
# Local environment check using ralph-gold
# Requires: uv tool install ralph-gold

set -e

echo "Checking environment with ralph-gold..."

# Check if ralph is available
if ! command -v ralph &> /dev/null; then
    echo "Installing ralph-gold..."
    uv tool install ralph-gold
fi

# Run environment check
ralph check-environment --contract harness.contract.json

echo "Environment check passed!"
