#!/bin/bash
# Deploy Meridian programs to Solana
# Usage: ./scripts/deploy.sh [localnet|devnet|mainnet]

set -euo pipefail

CLUSTER="${1:-localnet}"
PROGRAMS=("meridian_jpy" "transfer_hook" "securities_engine" "rwa_registry" "oracle")

echo "=== Meridian Program Deployment ==="
echo "Cluster: $CLUSTER"
echo ""

# Validate cluster
case "$CLUSTER" in
  localnet|devnet|mainnet)
    ;;
  *)
    echo "Error: Invalid cluster '$CLUSTER'. Use: localnet, devnet, or mainnet"
    exit 1
    ;;
esac

# Safety check for mainnet
if [ "$CLUSTER" = "mainnet" ]; then
  echo "WARNING: You are deploying to MAINNET."
  echo "This will cost real SOL and affect real users."
  read -p "Type 'yes-mainnet' to confirm: " confirm
  if [ "$confirm" != "yes-mainnet" ]; then
    echo "Deployment cancelled."
    exit 0
  fi
fi

# Build programs
echo ">>> Building programs..."
anchor build
echo "Build complete."
echo ""

# Deploy each program
for program in "${PROGRAMS[@]}"; do
  echo ">>> Deploying $program to $CLUSTER..."
  anchor deploy --program-name "$program" --provider.cluster "$CLUSTER"
  echo "$program deployed."
  echo ""
done

echo "=== Deployment Complete ==="
echo "All ${#PROGRAMS[@]} programs deployed to $CLUSTER."
