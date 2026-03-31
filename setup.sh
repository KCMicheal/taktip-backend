#!/bin/bash
# TakTip Backend Setup Script
# This script sets up the Node.js environment and installs project dependencies

set -e

echo "🔧 TakTip Backend Setup Script"
echo "================================"

# Define the paths
NODE_BIN_DIR="$HOME/node_bin/bin"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_RC=""

# Detect shell configuration file
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
fi

echo ""
echo "📦 Step 1: Downloading and installing Node.js 20 LTS..."
echo "--------------------------------------------------------"

# Download and extract Node.js
curl --doh-url https://cloudflare-dns.com/dns-query -L \
    https://nodejs.org/dist/v20.12.0/node-v20.12.0-darwin-x64.tar.gz \
    -o /tmp/node.tar.gz

mkdir -p "$NODE_BIN_DIR"
tar xzf /tmp/node.tar.gz -C "$NODE_BIN_DIR" --strip-components=1
rm /tmp/node.tar.gz

echo "✅ Node.js $(node -v) installed to $NODE_BIN_DIR"

echo ""
echo "📦 Step 2: Installing pnpm globally..."
echo "----------------------------------------"
npm install -g pnpm
echo "✅ pnpm $(pnpm -v) installed"

echo ""
echo "📦 Step 3: Adding Node.js to PATH..."
echo "--------------------------------------"

if [ -n "$SHELL_RC" ]; then
    # Check if already added
    if ! grep -q "$NODE_BIN_DIR" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# TakTip Backend - Node.js path" >> "$SHELL_RC"
        echo "export PATH=\"$NODE_BIN_DIR:\$PATH\"" >> "$SHELL_RC"
        echo "✅ Added Node.js path to $SHELL_RC"
        echo ""
        echo "⚠️  Please run the following command to apply changes:"
        echo "    source $SHELL_RC"
    else
        echo "✅ Node.js path already configured in $SHELL_RC"
    fi
else
    echo "⚠️  Could not find shell config file. Please add this to your ~/.zshrc:"
    echo "    export PATH=\"$NODE_BIN_DIR:\$PATH\""
fi

echo ""
echo "📦 Step 4: Installing project dependencies..."
echo "----------------------------------------------"
cd "$PROJECT_DIR"
pnpm install

echo ""
echo "📦 Step 5: Generating Ed25519 JWT keys..."
echo "------------------------------------------"
mkdir -p keys
node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
fs.writeFileSync('keys/ed25519_private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync('keys/ed25519_public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
console.log('✅ Ed25519 keys generated successfully!');
"

echo ""
echo "📦 Step 6: Starting Docker services..."
echo "----------------------------------------"
if command -v docker &> /dev/null; then
    docker compose up -d
    echo "✅ PostgreSQL and Redis containers started"
else
    echo "⚠️  Docker not found. Please start Docker Desktop manually."
fi

echo ""
echo "================================"
echo "🎉 Setup complete!"
echo "================================"
echo ""
echo "To start the development server:"
echo "    pnpm run start:dev"
echo ""
echo "To start in production mode:"
echo "    pnpm run start:prod"
echo ""
echo "API documentation will be available at:"
echo "    http://localhost:3001/api/docs"
echo ""
