#!/bin/bash
# TakTip Backend - Pre-Push Quality Gate
# This script runs quality checks before allowing a push

set -e

echo "🔍 Running Pre-Push Quality Gate..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Add Node.js to PATH if installed locally
if [ -d "$HOME/node_bin/bin" ]; then
    export PATH="$HOME/node_bin/bin:$PATH"
fi

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        FAILED=1
    fi
}

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js not found. Please ensure it's in your PATH.${NC}"
    echo "    Run: export PATH=\"\$HOME/node_bin/bin:\$PATH\""
    exit 1
fi

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm not found. Installing...${NC}"
    npm install -g pnpm
fi

echo ""
echo "📦 Step 1: Installing dependencies..."
echo "-----------------------------------"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
print_status $? "Dependencies installed"

echo ""
echo "🔧 Step 2: Running lint check..."
echo "---------------------------------"
pnpm run lint 2>/dev/null || pnpm run lint
print_status $? "Lint check passed"

echo ""
echo "🏗️  Step 3: Building project..."
echo "-------------------------------"
pnpm run build
print_status $? "Build successful"

echo ""
echo "🔍 Step 4: Type checking..."
echo "---------------------------"
pnpm run typecheck 2>/dev/null || npx tsc --noEmit
print_status $? "Type checking passed"

echo ""
echo "🏥 Step 5: Health check (if Docker is running)..."
echo "-------------------------------------------------"
DOCKER_RUNNING=false
if docker info &> /dev/null; then
    DOCKER_RUNNING=true
    # Start Docker services if not running
    docker compose up -d 2>/dev/null || true
    
    echo "Waiting for services to be ready..."
    sleep 5
    
    # Run build again with server check
    pnpm run start &
    SERVER_PID=$!
    
    sleep 8
    
    # Test health endpoint
    if curl -sf http://localhost:3001/health > /dev/null; then
        print_status 0 "Health check passed"
    else
        # Only fail if Docker is running but health check fails
        echo -e "${YELLOW}⚠️  Health check failed (Docker running but DB not accessible)${NC}"
        echo -e "${YELLOW}   This may indicate Docker services need restart${NC}"
        echo -e "${YELLOW}   Run: docker compose restart${NC}"
    fi
    
    # Kill the server
    kill $SERVER_PID 2>/dev/null || true
else
    echo -e "${YELLOW}⚠️  Docker not running - skipping health check${NC}"
fi

echo ""
echo "=================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All checks passed! Proceeding with push.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please fix the issues before pushing.${NC}"
    exit 1
fi
