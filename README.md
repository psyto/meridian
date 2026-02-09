# Meridian

**JPY Stablecoin Infrastructure for Tokenized Securities and RWA Trading**

A Layer 1 blockchain platform for Asia's onchain capital markets.

## Overview

Meridian provides institutional-grade infrastructure for:
- **JPY Stablecoin**: Trust-type electronic payment method (信託型3号電子決済手段) compliant
- **Securities Trading**: 24/7 spot and derivatives markets for tokenized equities
- **RWA Tokenization**: Real-world asset registration, custody verification, and dividends
- **Compliance**: Built-in KYC/AML via Token-2022 transfer hooks

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MERIDIAN PLATFORM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │   JPY MINT     │  │   COMPLIANCE   │  │    TRADING     │        │
│  │   ENGINE       │  │    LAYER       │  │    ENGINE      │        │
│  │                │  │                │  │                │        │
│  │  meridian-jpy  │  │  transfer-hook │  │  securities-   │        │
│  │                │  │                │  │  engine        │        │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │
│          │                   │                   │                  │
│  ┌───────┴────────┐  ┌───────┴────────┐  ┌───────┴────────┐        │
│  │  RWA REGISTRY  │  │     ORACLE     │  │      SDK       │        │
│  │                │  │                │  │                │        │
│  │  rwa-registry  │  │     oracle     │  │  @meridian/sdk │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│                                                                     │
│                    ┌─────────────────────┐                         │
│                    │     API GATEWAY     │                         │
│                    │    Next.js + API    │                         │
│                    └─────────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Sources

This project synthesizes patterns from internal modules:

| Component | Key Patterns |
|-----------|--------------|
| JPY Stablecoin | Token-2022 mint, transfer hooks, collateral management |
| Transfer Hook | KYC whitelist, jurisdiction checks, daily limits |
| Securities Engine | AMM (x*y=k), LP tokens, pool management |
| Derivatives | Perpetuals, funding rates, variance swaps |
| Oracle | TWAP, volatility index, funding feeds |
| RWA Registry | Asset registration, ownership proofs, dividends |
| API Layer | Next.js patterns, Prisma schema, auth |

## Programs

### meridian-jpy
Core JPY stablecoin with Token-2022 extensions:
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

### JPY Stablecoin
```
POST /api/v1/jpy/mint/request     # Request JPY minting
GET  /api/v1/jpy/mint/status/:id  # Check mint status
POST /api/v1/jpy/burn             # Burn for redemption
```

### Compliance
```
POST /api/v1/jpy/compliance/kyc/submit  # Submit KYC
GET  /api/v1/jpy/compliance?wallet=...  # Check status
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
import { createMeridianClient, createJpySdk, createSecuritiesSdk } from '@meridian/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize client
const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = createMeridianClient({ connection });

// JPY operations
const jpySdk = createJpySdk(client);
const balance = await jpySdk.getBalance(walletPubkey, jpyMint);
console.log(jpySdk.formatAmount(balance)); // ¥1,234.56

// Securities trading
const secSdk = createSecuritiesSdk(client);
const quote = await secSdk.getSwapQuote(marketPubkey, inputAmount, true);
console.log(`Output: ${quote.outputAmount}, Impact: ${quote.priceImpact}%`);
```

## Regulatory Compliance

### Japanese PSA (資金決済法)
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

