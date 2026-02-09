#!/bin/bash
# Setup Meridian development environment
# Usage: ./scripts/setup.sh

set -euo pipefail

echo "=== Meridian Development Setup ==="
echo ""

# Check prerequisites
echo ">>> Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo "ERROR: $1 is not installed. $2"
    exit 1
  fi
  echo "  $1: $(command -v "$1")"
}

check_cmd "node" "Install Node.js 20+ from https://nodejs.org"
check_cmd "rustc" "Install Rust from https://rustup.rs"
check_cmd "solana" "Install Solana CLI from https://docs.solana.com/cli/install-solana-cli-tools"
check_cmd "anchor" "Install Anchor from https://www.anchor-lang.com/docs/installation"

# Check versions
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required, found v$(node --version)"
  exit 1
fi
echo "  Node.js: $(node --version)"
echo "  Rust: $(rustc --version | cut -d' ' -f2)"
echo "  Solana: $(solana --version | cut -d' ' -f2)"
echo "  Anchor: $(anchor --version | cut -d' ' -f2)"
echo ""

# Install dependencies
echo ">>> Installing Node.js dependencies..."
yarn install
echo ""

# Build Anchor programs
echo ">>> Building Solana programs..."
anchor build
echo ""

# Setup Solana keypair if not exists
if [ ! -f ~/.config/solana/id.json ]; then
  echo ">>> Generating Solana keypair..."
  solana-keygen new --no-bip39-passphrase
fi

# Set cluster to localnet
echo ">>> Setting Solana cluster to localhost..."
solana config set --url localhost
echo ""

# Generate Prisma client
echo ">>> Generating Prisma client..."
cd app && npx prisma generate && cd ..
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start local validator:  solana-test-validator"
echo "  2. Deploy programs:        anchor deploy"
echo "  3. Run tests:              anchor test"
echo "  4. Start dev server:       yarn dev"
