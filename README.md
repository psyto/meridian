# Meridian

**DeFi Where Every Swap is KYC-Compliant**

A Layer 1 blockchain platform for onchain capital markets.

## Overview

Meridian provides institutional-grade infrastructure for:
- **Stablecoin**: Trust-type electronic payment method compliant
- **Securities Trading**: 24/7 spot and derivatives markets for tokenized equities
- **RWA Tokenization**: Real-world asset registration, custody verification, and dividends
- **Compliance**: Built-in KYC/AML via Token-2022 transfer hooks
- **ZK Privacy**: Application-layer ZK proofs for private compliance verification — solving the Token-2022 limitation where transfer hooks and confidential transfers cannot coexist

## Design: ZK Compliance and Token-2022 Confidential Transfers

**Problem**: Solana Token-2022's confidential transfer extension and transfer hook extension are incompatible — a token mint cannot enable both simultaneously. This means a compliant stablecoin using transfer hooks for KYC enforcement cannot also use confidential transfers for privacy.

**Solution**: Meridian uses an application-layer ZK compliance approach via the `ZkComplianceProver`:

- Instead of relying on Token-2022 confidential transfers, the `ZkComplianceProver` generates Noir ZK proofs that attest a trader meets KYC requirements (level, jurisdiction, expiry) without revealing identity details
- The proof commits to KYC level, jurisdiction, and expiry via Pedersen commitments — the verifier learns only that requirements are satisfied, not the actual values
- This preserves transfer hook enforcement (KYC/AML on every transfer) while providing privacy at the compliance verification layer
- The `compliant-registry` program stores a `zk_verifier_key` in `ComplianceConfig` for on-chain proof verification

### @meridian/compliant-router

A Jupiter-compatible router that only routes through KYC-whitelisted pools, enabling institutional DeFi access.

**Key classes:**
- **ComplianceAwareRouter** — Wraps Jupiter aggregation with compliance filtering. Gets a quote, then rejects routes containing non-whitelisted pool hops.
- **PoolWhitelistManager** — Syncs the on-chain `compliant-registry` pool entries and provides fast lookup by AMM key.
- **RouteComplianceFilter** — Checks each `routePlan[].swapInfo.ammKey` against the whitelist. Falls back to direct-only routes if multi-hop fails.
- **KycComplianceChecker** — Reads the transfer-hook `WhitelistEntry` to validate trader KYC level, jurisdiction, and expiry.
- **ZkComplianceProver** — Generates Noir ZK proofs that a trader meets KYC requirements without revealing identity.

```typescript
import { ComplianceAwareRouter, QuoteRequest } from '@meridian/compliant-router';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const registryAuthority = new PublicKey('...');

const router = new ComplianceAwareRouter(connection, registryAuthority, {
  defaultSlippageBps: 50,
  fallbackToDirectRoutes: true,
  maxRouteHops: 4,
});

const request: QuoteRequest = { inputMint, outputMint, amount };
const result = await router.getCompliantQuote(trader, request, jurisdictionBitmask);

// CompliantQuoteResult fields:
//   result.quote              — Jupiter QuoteResponse (filtered to compliant route)
//   result.wasFiltered        — true if the original route was re-fetched for compliance
//   result.compliantHopCount  — number of compliant hops in the route
//   result.traderKycLevel     — trader's KYC level (Basic/Standard/Enhanced/Institutional)
//   result.traderJurisdiction — trader's jurisdiction
```

**`ComplianceRouterConfig` fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `registryProgramId` | `PublicKey` | Built-in | Compliant registry program ID |
| `transferHookProgramId` | `PublicKey` | Built-in | Transfer-hook program ID for KYC lookups |
| `jupiterApiBaseUrl` | `string` | `https://quote-api.jup.ag/v6` | Jupiter API endpoint |
| `defaultSlippageBps` | `number` | `50` | Default slippage in basis points |
| `fallbackToDirectRoutes` | `boolean` | `true` | Fall back to direct routes when multi-hop fails compliance |
| `maxRouteHops` | `number` | `4` | Maximum route hops to consider |

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

**Instructions:** `initialize_pool_registry`, `add_compliant_pool`, `suspend_pool`, `revoke_pool`, `reinstate_pool`, `initialize_compliance_config`, `verify_compliant_route`

**Events:** `PoolRegistryCreated`, `PoolAdded`, `PoolStatusChanged`, `ComplianceConfigCreated`, `RouteVerified`

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
git clone https://github.com/psyto/meridian.git
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
GET  /api/v1/swap/quote    # Get compliant swap quote (filters non-whitelisted pools)
POST /api/v1/swap/execute  # Execute compliant swap
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

