# JPY Stablecoin Project - Cross-Breeding Analysis

## Overview

This document outlines the development strategy for the Meridian JPY stablecoin project, leveraging existing repositories to accelerate development.

**Target Launch**: Q1 2026
**Regulatory Framework**: Japanese PSA (資金決済法) - Trust-type Electronic Payment Method (信託型3号電子決済手段)
**Key Feature**: No 100万円 limit for domestic transfers

---

## Project Partners

| Partner | Role |
|---------|------|
| **Meridian Holdings** | Regulatory compliance, distribution, investor onboarding |
| **Meridian Labs** | Smart contracts, API design, security systems, ecosystem |
| **Meridian Trust Bank** | Stablecoin issuance & redemption |
| **Meridian Trading** | Distribution as electronic payment instrument operator |

---

## Reusable Repository Analysis

### High-Value Repositories

| Repository | Stack | Reusable Components | Priority |
|------------|-------|---------------------|----------|
| Collateral Manager | Solana Anchor | Multi-collateral management, risk parameters, liquidation | Critical |
| DEX Core | Solana Anchor | AMM pools, LP tokens, fee collection | Critical |
| DEX Aggregator | TypeScript | Jupiter API, route optimization | High |
| Privacy Suite | Solana/TS | KYC encryption, ZK compression, confidential transfers | Critical |
| Asset Registry | Solana Anchor | Asset registration, ownership proofs, lease contracts | High |
| Settlement Engine | Solidity | Multi-party settlement, arbiter system | Medium |
| API Platform | Next.js/Prisma | API patterns, auth, AI insights, dashboard UI | High |
| Market Engine | Solana Anchor | AMM (x*y=k), outcome tokens, market settlement | Medium |
| Token Core | Solidity | ERC20 mint/burn patterns | Medium |

### Repository Details

#### 1. Collateral Manager

**Key Structures:**
```rust
pub struct Bank {
    pub authority: Pubkey,
    pub mint_address: Pubkey,
    pub total_deposits: u64,
    pub total_deposits_shares: u64,
    pub liquidation_threshold: u64,  // 8000 = 80%
    pub liquidation_bonus: u64,      // 500 = 5%
    pub max_ltv: u64,                // 7500 = 75%
    pub last_updated: i64,
}
```

**Reusable For:**
- Collateral ratio management
- Risk parameter framework
- Share-based accounting for interest distribution

#### 2. DEX Core

**Key Structures:**
```rust
pub struct Pool {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub fee_rate: u16,
    pub lp_token_mint: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
}
```

**Reusable For:**
- JPY/USDC trading pair
- Liquidity pool mechanics
- Fee collection model

#### 3. Privacy Suite

**Key Features:**
- NaCl box encryption (Curve25519-XSalsa20-Poly1305)
- Shamir's Secret Sharing (threshold cryptography)
- ZK compression via Light Protocol
- Shielded transfers via Privacy Cash SDK

**Reusable For:**
- KYC/AML data encryption
- Confidential RWA metadata
- Multi-sig settlement authorization

#### 4. Asset Registry

**Key Structures:**
```rust
pub struct LeaseContract {
    pub equipment: Pubkey,
    pub lessor: Pubkey,
    pub lessee: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub hourly_rate: u64,
    pub status: ContractStatus,
}
```

**Reusable For:**
- Collateral registration system
- Ownership proof for compliance
- Time-bound agreements

#### 5. API Platform

**Tech Stack:**
- Next.js 16 + TypeScript
- Prisma ORM + PostgreSQL
- TanStack Query
- Anthropic Claude AI integration
- Solana Wallet Adapter

**API Patterns:**
```
/api/markets/
/api/ai/insights/[marketId]
/api/portfolio/positions
/api/leaderboard/
```

**Reusable For:**
- Authentication framework
- API design patterns
- AI-powered analytics
- Dashboard UI components

#### 6. DEX Aggregator

**Key Features:**
- Jupiter Aggregator API v6 integration
- Multi-DEX price comparison
- Slippage protection
- Route optimization

**Reusable For:**
- DEX liquidity aggregation for JPY pairs
- Best execution paths
- Price oracle data source

---

## Architecture Design

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      JPY STABLECOIN SYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │   MINTING      │  │   COMPLIANCE   │  │    TRADING     │        │
│  │   ENGINE       │  │    LAYER       │  │    ENGINE      │        │
│  │                │  │                │  │                │        │
│  │  - Mint/Burn   │  │  - KYC/AML     │  │  - AMM Pools   │        │
│  │  - Collateral  │  │  - Ownership   │  │  - Aggregator  │        │
│  │  - Risk Mgmt   │  │  - Encryption  │  │  - Settlement  │        │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │
│          │                   │                   │                  │
│          └───────────────────┼───────────────────┘                  │
│                              │                                      │
│                    ┌─────────┴─────────┐                           │
│                    │    API GATEWAY    │                           │
│                    └─────────┬─────────┘                           │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                 │
│          │                   │                   │                  │
│  ┌───────┴───────┐  ┌───────┴───────┐  ┌───────┴───────┐          │
│  │   ISSUERS     │  │    USERS      │  │  EXCHANGES    │          │
│  │   (Trust)     │  │   (Retail/    │  │  (Meridian    │          │
│  │               │  │    Corp)      │  │   Trading)    │          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Fiat JPY    │────▶│  Trust Bank  │────▶│  JPY Token   │
│  Deposit     │     │  (Meridian)  │     │  Mint        │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  On-chain    │◀────│  Compliance  │◀────│  KYC/AML     │
│  Transfer    │     │  Check       │     │  Verification│
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  DEX/CEX     │◀────│  Liquidity   │◀────│  Pool        │
│  Trading     │     │  Aggregation │     │  Management  │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Smart Contract Design

### JPY Stablecoin Core

```rust
// jpy_stablecoin/src/state.rs

use anchor_lang::prelude::*;

#[account]
pub struct JpyMint {
    /// Authority that can mint/burn (Trust Bank)
    pub authority: Pubkey,

    /// SPL Token mint address
    pub mint_address: Pubkey,

    /// Total JPY tokens in circulation
    pub total_supply: u64,

    /// Collateral ratio (10000 = 100%)
    pub collateral_ratio: u64,

    /// Compliance registry PDA
    pub compliance_registry: Pubkey,

    /// Emergency pause flag
    pub is_paused: bool,

    /// Last updated timestamp
    pub last_updated: i64,

    /// Bump seed
    pub bump: u8,
}

#[account]
pub struct CollateralVault {
    /// Associated JPY mint
    pub jpy_mint: Pubkey,

    /// Total fiat collateral (in smallest unit)
    pub total_collateral: u64,

    /// Vault authority
    pub authority: Pubkey,

    /// Audit timestamp
    pub last_audit: i64,
}
```

### Compliance Module

```rust
// jpy_stablecoin/src/compliance.rs

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum KycStatus {
    Pending,
    Verified,
    Rejected,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Jurisdiction {
    Japan,
    Singapore,
    USA,
    EU,
    Other,
}

#[account]
pub struct ComplianceRecord {
    /// Wallet address of the holder
    pub holder: Pubkey,

    /// Encrypted KYC data hash (NaCl box)
    pub kyc_hash: [u8; 32],

    /// Verification status
    pub verification_status: KycStatus,

    /// User's jurisdiction
    pub jurisdiction: Jurisdiction,

    /// Daily transaction limit (0 = unlimited for trust-type)
    pub daily_limit: u64,

    /// Accumulated daily volume
    pub daily_volume: u64,

    /// Last volume reset timestamp
    pub volume_reset_time: i64,

    /// Verification expiry timestamp
    pub expiry_time: i64,

    /// Bump seed
    pub bump: u8,
}

#[account]
pub struct OwnershipProof {
    /// Asset identifier
    pub asset_id: Pubkey,

    /// Current owner
    pub owner: Pubkey,

    /// Registration timestamp
    pub registered_at: i64,

    /// Proof hash
    pub proof_hash: [u8; 32],

    /// Is active
    pub is_active: bool,
}
```

### JPY Trading Pool

```rust
// jpy_stablecoin/src/pool.rs

use anchor_lang::prelude::*;

#[account]
pub struct JpyPool {
    /// JPY stablecoin mint
    pub jpy_mint: Pubkey,

    /// Counter token mint (USDC)
    pub counter_mint: Pubkey,

    /// JPY liquidity in pool
    pub jpy_liquidity: u64,

    /// Counter token liquidity
    pub counter_liquidity: u64,

    /// LP token mint
    pub lp_mint: Pubkey,

    /// Fee rate in basis points (e.g., 30 = 0.3%)
    pub fee_rate: u16,

    /// Accumulated fees (JPY)
    pub accumulated_fees_jpy: u64,

    /// Accumulated fees (counter)
    pub accumulated_fees_counter: u64,

    /// Pool authority
    pub authority: Pubkey,

    /// Oracle price feed (Pyth/Switchboard)
    pub oracle_price: Pubkey,

    /// Pool bump
    pub bump: u8,
}

impl JpyPool {
    /// Calculate output amount using constant product formula (x * y = k)
    pub fn calculate_swap_output(
        &self,
        input_amount: u64,
        is_jpy_input: bool,
    ) -> Result<u64> {
        let (input_reserve, output_reserve) = if is_jpy_input {
            (self.jpy_liquidity, self.counter_liquidity)
        } else {
            (self.counter_liquidity, self.jpy_liquidity)
        };

        // Apply fee
        let fee = (input_amount as u128 * self.fee_rate as u128) / 10000;
        let input_with_fee = input_amount as u128 - fee;

        // x * y = k formula
        let numerator = input_with_fee * output_reserve as u128;
        let denominator = input_reserve as u128 + input_with_fee;

        Ok((numerator / denominator) as u64)
    }
}
```

---

## API Design

### Endpoint Structure

```
/api/v1/jpy/
├── mint/
│   ├── POST /request          # Request JPY minting
│   ├── GET  /status/:id       # Check mint request status
│   └── POST /burn             # Burn JPY for fiat redemption
│
├── compliance/
│   ├── POST /kyc/submit       # Submit KYC documents
│   ├── GET  /kyc/status/:addr # Check KYC status
│   ├── POST /kyc/refresh      # Refresh expired KYC
│   └── GET  /limits/:addr     # Get transaction limits
│
├── transfer/
│   ├── POST /send             # Send JPY to address
│   ├── GET  /history/:addr    # Transaction history
│   └── GET  /pending/:addr    # Pending transactions
│
├── swap/
│   ├── GET  /quote            # Get swap quote
│   ├── POST /execute          # Execute swap
│   └── GET  /routes           # Available routes (Jupiter)
│
├── pool/
│   ├── GET  /info             # Pool statistics
│   ├── POST /add-liquidity    # Add liquidity
│   ├── POST /remove-liquidity # Remove liquidity
│   └── GET  /positions/:addr  # LP positions
│
└── analytics/
    ├── GET  /metrics          # Stablecoin metrics
    ├── GET  /volume           # Trading volume
    └── GET  /holders          # Holder statistics
```

### Request/Response Examples

```typescript
// POST /api/v1/jpy/mint/request
interface MintRequest {
  amount: string;           // Amount in smallest unit
  recipient: string;        // Solana address
  reference: string;        // Bank transfer reference
  jurisdiction: string;     // "JP" | "SG" | etc.
}

interface MintResponse {
  requestId: string;
  status: "pending" | "processing" | "completed" | "failed";
  estimatedCompletion: string;  // ISO timestamp
  transactionSignature?: string;
}

// GET /api/v1/jpy/swap/quote
interface SwapQuoteRequest {
  inputMint: string;        // JPY or USDC mint
  outputMint: string;
  amount: string;
  slippageBps: number;      // e.g., 50 = 0.5%
}

interface SwapQuoteResponse {
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  fee: string;
  route: RouteInfo[];
  expiresAt: string;
}
```

---

## Development Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Week | Task | Components |
|------|------|------------|
| 1 | Setup project structure, create JPY mint contract | Collateral Manager, Token Core |
| 2 | Implement compliance module with encrypted KYC | Asset Registry, Privacy Suite |
| 3 | Build basic mint/burn functionality | Collateral Manager |
| 4 | Unit tests and local validator testing | All |

### Phase 2: Trading Infrastructure (Weeks 5-8)

| Week | Task | Components |
|------|------|------------|
| 5 | Create JPY/USDC AMM pool | DEX Core, Market Engine |
| 6 | Integrate Jupiter aggregator | DEX Aggregator |
| 7 | Build settlement escrow for institutions | Settlement Engine |
| 8 | Integration testing on devnet | All |

### Phase 3: API & Frontend (Weeks 9-12)

| Week | Task | Components |
|------|------|------------|
| 9 | Build API gateway with authentication | API Platform |
| 10 | Implement all API endpoints | API Platform |
| 11 | Create dashboard UI | API Platform, Market Engine |
| 12 | Security audit preparation | Privacy Suite |

### Phase 4: Compliance & Launch (Weeks 13-16)

| Week | Task | Notes |
|------|------|-------|
| 13 | Regulatory review | Japanese PSA compliance |
| 14 | Security audit | Third-party audit |
| 15 | Mainnet deployment | Phased rollout |
| 16 | Public launch | Q1 2026 target |

---

## Gaps Requiring New Development

| Component | Priority | Description | Recommendation |
|-----------|----------|-------------|----------------|
| **Oracle Integration** | Critical | JPY/USD price feed | Pyth Network or Switchboard |
| **PSA Compliance Module** | Critical | 資金決済法 requirements | Custom development |
| **Trust Bank API** | Critical | Trust bank integration | Work with partner team |
| **Cross-chain Bridge** | High | Multi-blockchain support | Wormhole or LayerZero |
| **Interest Rate Model** | Medium | JPY lending products | Adapt from Collateral Manager |
| **AI Agent Payments** | Medium | Autonomous agent support | Extend API Platform AI patterns |
| **Tax Reporting** | Medium | Japanese tax compliance | Custom development |

---

## Technology Stack

### Smart Contracts
- **Primary**: Solana Anchor (Rust)
- **Secondary**: Solidity (for Ethereum/L2 deployment)

### Backend
- **Framework**: Next.js 16 with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Queue**: Bull MQ

### Frontend
- **Framework**: React 19 / Next.js
- **UI**: Radix UI + Tailwind CSS
- **State**: Zustand + TanStack Query
- **Wallet**: Solana Wallet Adapter

### Infrastructure
- **Hosting**: Vercel / AWS
- **Monitoring**: DataDog
- **Logging**: Winston + CloudWatch

### Security
- **Encryption**: NaCl box
- **Key Management**: AWS KMS / HashiCorp Vault
- **Audit**: Third-party security auditor

---

## File Structure

```
meridian/
├── programs/
│   ├── meridian-jpy/         # JPY stablecoin program
│   ├── transfer-hook/        # KYC/AML transfer hooks
│   ├── securities-engine/    # Trading infrastructure
│   ├── oracle/               # Price feeds & market data
│   └── rwa-registry/         # Real-world asset registry
│
├── app/                      # Next.js web application
│   ├── src/app/
│   │   ├── api/v1/           # REST API endpoints
│   │   ├── dashboard/        # User dashboard pages
│   │   ├── admin/            # Admin panel
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities & i18n
│   └── prisma/               # Database schema
│
├── packages/
│   ├── sdk/                  # TypeScript SDK
│   ├── aggregator/           # DEX aggregation (planned)
│   └── encryption/           # Encryption utilities (planned)
│
├── tests/                    # Test suite
├── migrations/               # Database migrations
├── scripts/                  # Deployment & setup scripts
├── Anchor.toml
├── package.json
└── README.md
```

---

## Use Cases

### 1. Retail Payments
- Domestic JPY transfers without 100万円 limit
- E-commerce checkout integration
- P2P transfers

### 2. Corporate Treasury
- Cross-border B2B payments
- Supply chain settlements
- Payroll in JPY stablecoin

### 3. DeFi Integration
- JPY lending/borrowing
- Liquidity provision
- Yield farming

### 4. AI Agent Economy
- Autonomous agent payments
- Micro-transactions
- Service-to-service settlements

### 5. RWA (Real World Assets)
- Tokenized asset dividends
- Real estate settlements
- Securities clearing

---

## References

- [Japanese PSA Regulations](https://www.fsa.go.jp/)
- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)

---

*Document version: 1.1*
