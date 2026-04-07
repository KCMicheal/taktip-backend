#!/bin/bash

# Setup git hooks for the project
# Run this once after cloning or pulling changes

set -e

echo "🔗 Setting up git hooks..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configure git to use .githooks directory
cd "$PROJECT_ROOT"
git config core.hooksPath .githooks

echo "✅ Git hooks configured to use .githooks directory"
echo "   Hooks will run before commit and push"
