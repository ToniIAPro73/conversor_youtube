#!/bin/bash

# setup-ubuntu.sh - Anclora FileStudio Environment Setup

set -e

echo "--- Anclora FileStudio Setup ---"

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script is intended for Ubuntu/Debian Linux."
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first."
    exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "ℹ️ pnpm not found. Installing via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

# Install system dependencies
echo "ℹ️ Installing system dependencies (ffmpeg, python3-pip)..."
sudo apt update
sudo apt install -y ffmpeg python3-pip

# Install yt-dlp
echo "ℹ️ Installing yt-dlp via pip..."
python3 -m pip install --user yt-dlp

# Export PATH if needed
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.bashrc
    export PATH="$PATH:$HOME/.local/bin"
    echo "✅ Added ~/.local/bin to PATH"
fi

# Setup project
echo "ℹ️ Installing project dependencies..."
pnpm install

# Create local env
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "✅ Created .env.local"
fi

echo ""
echo "--- Setup Completed Successfully! ---"
echo "Run 'pnpm check:deps' to verify dependencies."
echo "Run 'pnpm dev' to start the development server."
