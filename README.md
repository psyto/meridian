# Meridian

**Stablecoin Infrastructure for Tokenized Securities and RWA Trading**

A Layer 1 blockchain platform for Asia's onchain capital markets.

## Overview

Meridian provides institutional-grade infrastructure for:
- **Stablecoin**: Trust-type electronic payment method compliant
- **Securities Trading**: 24/7 spot and derivatives markets for tokenized equities
- **RWA Tokenization**: Real-world asset registration, custody verification, and dividends
- **Compliance**: Built-in KYC/AML via Token-2022 transfer hooks

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           MERIDIAN PLATFORM                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  STABLECOIN    │  │   COMPLIANCE   │  │    TRADING     │             │
│  │   ENGINE       │  │    LAYER       │  │    ENGINE      │             │
│  │                │  │                │  │                │             │
│  │meridian-stblcn │  │  transfer-hook │  │  securities-   │             │
│  │                │  │                │  │  engine        │             │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘             │
│          │                   │                   │                       │
│  ┌───────┴────────┐  ┌───────┴────────┐  ┌───────┴────────┐             │
│  │  RWA REGISTRY  │  │     ORACLE     │  │      SDK       │             │
│  │                │  │                │  │                │             │
│  │  rwa-registry  │  │     oracle     │  │  @meridian/sdk │             │
│  └────────────────┘  └────────────────┘  └────────────────┘             │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    COMPLIANT ROUTING LAYER                        │   │
│  │                                                                   │   │
│  │  compliant-registry (on-chain)    @meridian/compliant-router (TS) │   │
│  │  Pool whitelist, KYC levels,      Jupiter filter, KYC checker,    │   │
│  │  jurisdiction rules               ZK compliance proofs            │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│                    ┌─────────────────────┐                               │
│                    │     API GATEWAY     │                               │
│                    │    Next.js + API    │                               │
│                    └─────────────────────┘                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Sources

This project synthesizes patterns from internal modules:

| Component | Key Patterns |
|-----------|--------------|
| Stablecoin | Token-2022 mint, transfer hooks, collateral management |
| Transfer Hook | KYC whitelist, jurisdiction checks, daily limits |
| Securities Engine | AMM (x*y=k), LP tokens, pool management |
| Derivatives | Perpetuals, funding rates, variance swaps |
| Oracle | TWAP, volatility index, funding feeds |
| RWA Registry | Asset registration, ownership proofs, dividends |
| API Layer | Next.js patterns, Prisma schema, auth |

## Programs

### meridian-stablecoin
Core stablecoin with Token-2022 extensions:
- Mint/burn with collateral verification
- Multi-issuer support (Trust Bank, Distributors)
- Emergency pause mechanism
- Audit trail for compliance

### transfer-hook
KYC/AML enforcement via transfer hooks:
- Whitelist-based transfers
- Jurisdiction restrictions (US blocked)
- Daily limit enforcement
- Expiry management

### securities-engine
24/7 trading infrastructure:
- AMM pools for spot trading
- Perpetual futures with funding
- Variance and funding rate swaps
- Order book for limit orders

### oracle
Price feed infrastructure:
- Real-time price updates
- TWAP calculation
- Volatility regime detection
- Multi-source funding rates

### rwa-registry
Real-world asset tokenization:
- Asset registration with custody
- Ownership proof management
- Dividend distribution
- Freeze/unfreeze for compliance

### compliant-registry
Compliance-aware pool management for institutional DeFi:
- Pool whitelist registry with KYC level requirements
- Jurisdiction-based restrictions
- Pool lifecycle management (active/suspended/revoked)
- Batch route verification for Jupiter-compatible routing
- Audit hash and expiry tracking per pool

## Packages

### @meridian/compliant-router
A Jupiter-compatible router that only routes through KYC-whitelisted pools, enabling institutional DeFi access.

**Key classes:**
- **ComplianceAwareRouter** — Wraps Jupiter aggregation with compliance filtering. Gets a quote, then rejects routes containing non-whitelisted pool hops.
- **PoolWhitelistManager** — Syncs the on-chain `compliant-registry` pool entries and provides fast lookup by AMM key.
- **RouteComplianceFilter** — Checks each `routePlan[].swapInfo.ammKey` against the whitelist. Falls back to direct-only routes if multi-hop fails.
- **KycComplianceChecker** — Reads the transfer-hook `WhitelistEntry` to validate trader KYC level, jurisdiction, and expiry.
- **ZkComplianceProver** — Generates Noir ZK proofs that a trader meets KYC requirements without revealing identity.

```typescript
import { ComplianceAwareRouter } from '@meridian/compliant-router';

const router = new ComplianceAwareRouter(config);
await router.syncWhitelist();

const result = await router.getCompliantQuote(
  traderWallet, inputMint, outputMint, amount, slippageBps
);
// result contains the Jupiter quote filtered to only compliant pool hops
```

## Getting Started

### Prerequisites
- Rust 1.75+
- Solana CLI 2.2+
- Anchor 0.32+
- Node.js 20+
- PostgreSQL 15+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd meridian

# Install dependencies
yarn install

# Build Anchor programs
anchor build

# Generate Prisma client
yarn db:generate

# Run tests
anchor test
```

### Development

```bash
# Start local validator
solana-test-validator

# Deploy programs
anchor deploy

# Start Next.js dev server
yarn dev
```

## API Endpoints

### Stablecoin
```
POST /api/v1/stablecoin/mint/request     # Request stablecoin minting
GET  /api/v1/stablecoin/mint/status/:id  # Check mint status
POST /api/v1/stablecoin/burn             # Burn for redemption
```

### Compliance
```
POST /api/v1/stablecoin/compliance/kyc/submit  # Submit KYC
GET  /api/v1/stablecoin/compliance?wallet=...  # Check status
```

### Trading
```
GET  /api/v1/swap/quote    # Get swap quote
POST /api/v1/swap/execute  # Execute swap
```

### Securities
```
GET  /api/v1/securities/markets         # List markets
GET  /api/v1/securities/markets/:symbol # Market details
POST /api/v1/securities/positions       # Open position
```

### RWA
```
GET  /api/v1/rwa/assets          # List RWA assets
GET  /api/v1/rwa/assets/:symbol  # Asset details
GET  /api/v1/rwa/dividends       # Pending dividends
```

## SDK Usage

```typescript
import { createMeridianClient, createStablecoinSdk, createSecuritiesSdk } from '@meridian/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize client
const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = createMeridianClient({ connection });

// Stablecoin operations
const stablecoinSdk = createStablecoinSdk(client);
const balance = await stablecoinSdk.getBalance(walletPubkey, stablecoinMint);
console.log(stablecoinSdk.formatAmount(balance));

// Securities trading
const secSdk = createSecuritiesSdk(client);
const quote = await secSdk.getSwapQuote(marketPubkey, inputAmount, true);
console.log(`Output: ${quote.outputAmount}, Impact: ${quote.priceImpact}%`);
```

## Regulatory Compliance

### Regulatory Compliance
- Trust-type electronic payment method (信託型3号電子決済手段)
- No ¥1,000,000 limit for domestic transfers
- 100% fiat collateral backing
- Regular audit requirements

### KYC/AML
- All transfers validated via transfer hook
- Jurisdiction-based restrictions
- Multi-level KYC verification
- Expiry and renewal management

## Partners

| Partner | Role |
|---------|------|
| **Meridian Trust Bank** | Stablecoin issuance & redemption |
| **Meridian Trading** | Distribution as electronic payment operator |

## License

