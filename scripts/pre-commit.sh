#!/bin/bash

# Pre-commit hook script
# Runs lint and tests before each commit
# Usage: ./scripts/pre-commit.sh

set -e

echo "🔍 Running pre-commit checks..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found. Running pnpm install...${NC}"
    pnpm install
fi

echo ""
echo "🔧 Step 1: Running lint check..."
echo "-----------------------------------"
if pnpm run lint; then
    echo -e "${GREEN}✅ Lint check passed${NC}"
else
    echo -e "${RED}❌ Lint check failed${NC}"
    echo -e "${YELLOW}Please fix the lint errors before committing${NC}"
    exit 1
fi

echo ""
echo "🧪 Step 2: Running tests..."
echo "-----------------------------------"
if pnpm run test; then
    echo -e "${GREEN}✅ Tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    echo -e "${YELLOW}Please fix failing tests before committing${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 All pre-commit checks passed!${NC}"
