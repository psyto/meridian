# Meridian

**DeFi Where Every Swap is KYC-Compliant**

An institutional liquidity layer on Solana for onchain capital markets.

## Overview

Meridian provides institutional-grade infrastructure for:
- **Stablecoin**: Trust-type electronic payment method compliant with Japanese PSA
- **Securities Trading**: 24/7 spot and derivatives markets for tokenized equities
- **RWA Tokenization**: Real-world asset registration, custody verification, and dividends
- **Compliance**: Built-in KYC/AML via Token-2022 transfer hooks, powered by the Fabrknt compliance stack (@fabrknt/accredit-core for on-chain KYC, @fabrknt/complr-sdk for off-chain sanctions/PEP screening)
- **ZK Privacy**: Application-layer Noir ZK proofs for private compliance verification, with on-chain attestation via the zk-verifier program
- **Hybrid Liquidity**: Shield escrow protocol for accessing full Jupiter DEX liquidity while maintaining compliance

## Design: ZK Compliance and Token-2022 Confidential Transfers

**Problem**: Solana Token-2022's confidential transfer extension and transfer hook extension are incompatible — a token mint cannot enable both simultaneously. This means a compliant stablecoin using transfer hooks for KYC enforcement cannot also use confidential transfers for privacy.

**Solution**: Meridian uses an application-layer ZK compliance approach:

1. The `ZkComplianceProver` (TypeScript) generates Noir ZK proofs that attest a trader meets KYC requirements (level, jurisdiction, expiry) without revealing identity details
2. Proofs commit to KYC attributes via Pedersen commitments — the verifier learns only that requirements are satisfied, not the actual values
3. The on-chain `zk-verifier` program verifies proofs and creates `ComplianceAttestation` PDAs that other programs can check
4. Transfer hook enforcement (KYC/AML on every transfer) is preserved while privacy is provided at the compliance verification layer

The proof system is pluggable via the `ProofBackend` interface:
- `PlaceholderBackend` — SHA-256 based, for testing and development
- `NoirBackend` — delegates to `nargo prove` / `bb verify` for real ZK proofs in production

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MERIDIAN PLATFORM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  STABLECOIN  │ │   TRADING    │ │   PRIVACY    │ │SHIELD ESCROW │       │
│  │   ENGINE     │ │   ENGINE     │ │    LAYER     │ │  (devnet)    │       │
│  │              │ │              │ │              │ │              │       │
│  │ meridian-    │ │ securities-  │ │ zk-verifier  │ │shield-escrow │       │
│  │ stablecoin   │ │ engine       │ │              │ │              │       │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────────────┘       │
│         │                │                │                                │
│  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐                       │
│  │ RWA REGISTRY │ │    ORACLE    │ │  ACCREDIT    │                       │
│  │              │ │              │ │  (external)  │                       │
│  │ rwa-registry │ │   oracle     │ │transfer-hook │                       │
│  │              │ │              │ │compliant-reg │                       │
│  └──────────────┘ └──────────────┘ └──────────────┘                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           SDK & TOOLING                             │    │
│  │                                                                     │    │
│  │  @meridian/sdk          @meridian/aggregator       meridian-cli     │    │
│  │  - StablecoinSdk        - ComplianceAwareRouter    - shield *       │    │
│  │  - SecuritiesSdk        - ComplianceShieldRouter    - zk *          │    │
│  │  - ShieldEscrowSdk      - PoolWhitelistManager     - kyc *         │    │
│  │  - ZkVerifierSdk                                   - mint/burn     │    │
│  │  - ZkComplianceProver   @fabrknt/accredit-core     - config               │    │
│  │  - ProofBackend         @fabrknt/accredit-sdk                             │    │
│  │                         @fabrknt/complr-sdk                               │    │
│  │                         @fabrknt/veil-crypto                              │    │
│  │                         @fabrknt/stratum-core                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                      ┌─────────────────────┐                                │
│                      │     API GATEWAY     │                                │
│                      │    Next.js + API    │                                │
│                      └─────────────────────┘                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        NOIR ZK CIRCUITS                             │    │
│  │  circuits/compliance_proof/  — KYC compliance proof (Pedersen)      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Programs

Six Anchor workspace programs deployed on Solana, plus two independently deployed Accredit programs referenced by program ID:

| Program | ID | Description |
|---------|------------|-------------|
| `meridian-stablecoin` | `HdaU...6CwP` | Token-2022 stablecoin with mint/burn, multi-issuer, pause |
| `securities-engine` | `7eoN...3yTe` | AMM pools, perpetuals, funding/variance swaps, order book |
| `oracle` | `BXm2...UDpw` | TWAP, volatility index, multi-source funding rates |
| `rwa-registry` | `BMej...jL5D` | Asset registration, ownership proofs, dividends, freeze |
| `shield-escrow` | `6fQo...owpk` | Compliant hybrid liquidity escrow with fee collection (devnet) |
| `zk-verifier` | `ZKVR...91Kt` | Noir ZK proof verification and compliance attestations |

**Independently deployed (Accredit programs, not Anchor workspace members):**

| Program | ID | Description |
|---------|------------|-------------|
| `transfer-hook` | `5DLH...jVqW` | KYC whitelist, jurisdiction checks, daily limits, expiry |
| `compliant-registry` | `66tK...gnYA` | Pool whitelist, route verification, pool lifecycle |

### Shield Escrow Devnet Deployment

- **Program ID**: `6fQoefGQ4dRURCDBCo3p4pMWuypLoC1Kjgo6d8pYowpk`
- **IDL Account**: `6wX6b5DcyGBKavAjWp7AxfHZm4KTqauUPp5UdtwpxNYq`

### shield-escrow

On-chain component of the hybrid liquidity protocol. Enables KYC'd traders to access non-KYC liquidity pools through a whitelisted escrow PDA.

**Flow:**
1. Trader deposits tokens into escrow (transfer hook enforces compliance)
2. Keeper executes DEX swap via Jupiter-routed pools
3. Trader withdraws output tokens (transfer hook enforces compliance)

**Instructions:** `initialize`, `deposit`, `execute_swap`, `withdraw`, `refund`, `update_config`

**Accounts:**
- `ShieldConfig` (PDA: `["shield_config"]`) — authority, fee settings, volume stats, active flag
- `SwapReceipt` (PDA: `["swap_receipt", trader, nonce]`) — per-swap state tracking (Pending/Completed/Refunded)

### zk-verifier

On-chain verifier for Noir ZK compliance proofs. Stores verification keys and creates attestations for wallets that prove KYC/AML compliance without revealing private data.

**Instructions:** `initialize`, `update_verification_key`, `verify_proof`, `check_attestation`, `revoke_attestation`, `activate`, `deactivate`

**Accounts:**
- `VerifierConfig` (PDA: `["verifier_config"]`) — circuit ID, verification key, stats, active flag
- `ComplianceAttestation` (PDA: `["attestation", wallet]`) — KYC level, jurisdiction bitmask, commitment, expiry, validity

The `verify_proof` instruction creates or updates an attestation using `init_if_needed`, so wallets can refresh expired proofs without account cleanup.

## SDK

### Core SDKs

```typescript
import {
  createMeridianClient,
  createStablecoinSdk,
  createSecuritiesSdk,
  createShieldEscrowSdk,
  createZkVerifierSdk,
} from '@meridian/sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = createMeridianClient({ connection });

// Each SDK provides PDA derivation, account queries, and instruction builders
const stablecoin = createStablecoinSdk(client);
const securities = createSecuritiesSdk(client);
const shieldEscrow = createShieldEscrowSdk(client);
const zkVerifier = createZkVerifierSdk(client);
```

### Shield Escrow SDK

```typescript
const sdk = createShieldEscrowSdk(client);

// Query escrow configuration
const config = await sdk.getShieldConfig();
// config.feeBps, config.totalSwaps, config.totalVolume, config.isActive

// Query swap receipt
const receipt = await sdk.getSwapReceipt(traderPubkey, nonce);
// receipt.status — SwapStatus.Pending | Completed | Refunded

// Build instructions
const depositIx = sdk.createDepositInstruction(trader, {
  amount: new BN(1_000_000),
  nonce: 0,
  inputMint,
  outputMint,
});
const withdrawIx = sdk.createWithdrawInstruction(trader, { nonce: 0 });
```

### ZK Verifier SDK

```typescript
const sdk = createZkVerifierSdk(client);

// Check if a wallet has a valid, non-expired attestation
const attested = await sdk.isWalletAttested(walletPubkey);

// Query attestation details
const attestation = await sdk.getAttestation(walletPubkey);
// attestation.kycLevel, attestation.jurisdictionBitmask, attestation.expiryTimestamp

// Build verify proof instruction
const verifyIx = sdk.createVerifyProofInstruction(walletPubkey, {
  proof: proofBytes,
  commitment: commitmentBytes,
  requiredKycLevel: 2,
  jurisdictionBitmask: 0b111,
  expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 365,
});

// Revoke attestation (authority only)
const revokeIx = sdk.createRevokeAttestationInstruction(authority, walletPubkey);
```

### ZK Compliance Proofs

The `ZkComplianceProver` generates zero-knowledge proofs that attest a trader meets KYC requirements without revealing identity details. The circuit is implemented in Noir (`circuits/compliance_proof/`).

```typescript
import {
  ZkComplianceProver,
  ZkKycLevel,
  ZkJurisdiction,
  createJurisdictionBitmask,
  PlaceholderBackend,
  NoirBackend,
} from '@meridian/sdk';

// Use PlaceholderBackend for testing, NoirBackend for production
const prover = new ZkComplianceProver(new PlaceholderBackend());

// Trader's private KYC attributes (never revealed)
const witness = {
  kycLevel: ZkKycLevel.Enhanced,
  jurisdiction: ZkJurisdiction.Japan,
  expiry: Math.floor(Date.now() / 1000) + 86400 * 365,
  salt: prover.generateSalt(),
};

// Generate proof that trader meets requirements
const proof = await prover.generateProof(
  witness,
  ZkKycLevel.Standard,
  createJurisdictionBitmask([ZkJurisdiction.Japan, ZkJurisdiction.Singapore]),
);

// Verify locally (in production, submit on-chain via zk-verifier)
const result = await prover.verifyProof(proof);
// result.valid — true if proof is valid
```

**Proof Backend Interface:**

| Backend | Usage | Proof System |
|---------|-------|--------------|
| `PlaceholderBackend` | Testing/development | SHA-256 hash (not cryptographically sound) |
| `NoirBackend` | Production | `nargo prove` + `bb verify` (Barretenberg) |

The `NoirBackend` requires the Noir toolchain (`nargo`, `bb`) to be installed. It writes a `Prover.toml`, invokes `nargo prove`, and reads the proof artifact. Verification delegates to `bb verify` with the circuit's verification key.

**Noir Circuit** (`circuits/compliance_proof/src/main.nr`):

The circuit enforces four constraints:
1. `kyc_level >= required_kyc_level`
2. `jurisdiction` is set in `jurisdiction_bitmask`
3. `expiry > current_timestamp`
4. Pedersen commitment matches the private inputs (`std::hash::pedersen_hash`)

### Compliance Screening

```typescript
import { screenWallet, checkTransferCompliance } from '@meridian/sdk';

// Off-chain sanctions/PEP screening (via @fabrknt/complr-sdk)
const screenResult = await screenWallet(walletPubkey.toBase58());
// screenResult.sanctioned, screenResult.pep

const transferCheck = await checkTransferCompliance(sender, recipient, amount);
// transferCheck.allowed
```

### Order Matching (via @fabrknt/stratum-core)

```typescript
import { matchSecuritiesOrders, getMarketMetrics, getDepthAtPrice } from '@meridian/sdk';

const matcher = matchSecuritiesOrders(orders);
const fills = matcher.match(incomingOrder);

const metrics = getMarketMetrics(matcher);
// metrics.bestBid, metrics.bestAsk, metrics.spread, metrics.midPrice

const depth = getDepthAtPrice(matcher, 150.25);
```

### RWA Ownership Proofs (via @fabrknt/stratum-core)

```typescript
import { buildOwnershipTree, getOwnershipProof, createSettlementTracker } from '@meridian/sdk';

const tree = buildOwnershipTree(ownershipRecords);
const proof = getOwnershipProof(tree, recordIndex);

const tracker = createSettlementTracker(matchedOrderCount);
tracker.set(orderId);            // mark order as settled
tracker.get(orderId);            // check settlement status
```

## Compliant Routing

### ComplianceAwareRouter

Jupiter-compatible router that only routes through KYC-whitelisted pools.

```typescript
import { ComplianceAwareRouter, QuoteRequest } from '@meridian/compliant-router';

const router = new ComplianceAwareRouter(connection, registryAuthority, {
  defaultSlippageBps: 50,
  fallbackToDirectRoutes: true,
  maxRouteHops: 4,
});

const result = await router.getCompliantQuote(trader, request, jurisdictionBitmask);
// result.quote, result.wasFiltered, result.compliantHopCount
```

### ComplianceShieldRouter — Hybrid Liquidity

Solves liquidity fragmentation by using a KYC-whitelisted escrow PDA to access full Jupiter liquidity while maintaining end-to-end compliance.

**The problem:** Compliant-only routing excludes ~95% of DEX liquidity (Raydium, Orca, etc.) because those pools are not KYC-whitelisted.

**The solution:**
```
Trader → (compliant transfer) → Shield Escrow PDA → (Jupiter swap) → Shield Escrow PDA → (compliant transfer) → Trader
```

Both transfers to/from the trader pass transfer hook validation. The DEX swap uses the escrow's position.

```typescript
import { ComplianceShieldRouter } from '@meridian/aggregator';

const router = new ComplianceShieldRouter({
  compliantPoolKeys: new Set(['pool1', 'pool2']),
  escrow: { escrowPda, escrowProgramId, escrowAuthority },
  policy: {
    slippageThresholdBps: 100,      // engage shield at 1% slippage gap
    maxCompliantImpactPct: 2.0,     // engage shield at 2% price impact
    minImprovementPct: 0.1,         // require 0.1% improvement to justify shield
  },
});

const result = await router.getBestQuote({ inputMint, outputMint, amount });
// result.strategy     — 'compliant-only' | 'shielded' | 'direct-compliant'
// result.isShielded   — true if using the shield escrow path
// result.improvementBps
```

## CLI

The `meridian-cli` provides command-line management for all programs.

### Shield Escrow Commands

```bash
meridian shield init                          # Initialize shield escrow
meridian shield show-config                   # Display escrow configuration
meridian shield update-config --fee-bps 50    # Update fee settings
meridian shield show-receipt <trader> <nonce>  # Show swap receipt
```

### ZK Verifier Commands

```bash
meridian zk init                              # Initialize ZK verifier
meridian zk show-config                       # Display verifier configuration
meridian zk show-attestation <wallet>         # Show compliance attestation
meridian zk revoke <wallet>                   # Revoke attestation
meridian zk toggle --activate                 # Activate/deactivate verifier
```

### Existing Commands

```bash
meridian mint <amount>                        # Mint stablecoin
meridian burn <amount>                        # Burn stablecoin
meridian kyc show-whitelist                   # Show KYC whitelist
meridian kyc show-registry                    # Show KYC registry
meridian config show                          # Show CLI configuration
```

Global flags: `--rpc <url>`, `--wallet <path>`, `--shield-escrow-program <pubkey>`, `--zk-verifier-program <pubkey>`, `--json`

## Benchmarks

```bash
# Run ZK proof benchmark (PlaceholderBackend)
npx tsx benchmarks/zk-proof-bench.ts
```

Measures commitment computation, proof generation, and proof verification latency over 100 iterations with min/avg/p95/max statistics.

## External Dependencies — Fabrknt Compliance Stack

Meridian consumes the Fabrknt compliance and infrastructure packages as versioned npm dependencies and a Rust git dependency. These are **not** local workspace packages.

### TypeScript (npm)

| Package | Version | Used By | Purpose |
|---------|---------|---------|---------|
| `@fabrknt/accredit-core` | `^1.0.0` | `@meridian/sdk` | On-chain KYC verification (whitelist entry, KYC level, jurisdiction, expiry) |
| `@fabrknt/accredit-sdk` | `^1.0.0` | `@meridian/sdk` | Accredit client utilities and account deserialization |
| `@fabrknt/complr-sdk` | `^1.0.0` | `@meridian/sdk` | Off-chain sanctions/PEP screening (`screenWallet`, `checkTransferCompliance`) |
| `@fabrknt/stratum-core` | `^1.0.0` | `@meridian/sdk` | OrderMatcher, MerkleTree for ownership proofs, Bitfield for settlement tracking |
| `@fabrknt/veil-crypto` | `^1.0.0` | `@meridian/encryption` | NaCl box encryption (Curve25519-XSalsa20-Poly1305) |

Install via:

```bash
yarn add @fabrknt/accredit-core@^1.0.0 @fabrknt/accredit-sdk@^1.0.0 @fabrknt/complr-sdk@^1.0.0 @fabrknt/stratum-core@^1.0.0 @fabrknt/veil-crypto@^1.0.0
```

### Rust (git)

| Crate | Source | Used By | Purpose |
|-------|--------|---------|---------|
| `accredit-types` | `github.com/fabrknt/accredit` (tag `v1.0.0`) | On-chain programs | Shared KYC/compliance type definitions for Anchor programs |

Declared in the workspace `Cargo.toml`:

```toml
[workspace.dependencies]
accredit-types = { git = "https://github.com/fabrknt/accredit.git", tag = "v1.0.0" }
```

## Devnet Demo

A working end-to-end demo of the Shield Escrow protocol is available on Solana devnet.

**Deployed Program:**

| Program | Program ID |
|---------|------------|
| `shield_escrow` | `6fQoefGQ4dRURCDBCo3p4pMWuypLoC1Kjgo6d8pYowpk` |

**What the demo does:**

1. Creates USDC and wSOL Token-2022 mints on devnet
2. Initializes the shield config with a 0.3% fee
3. Trader deposits 1,000 USDC into the escrow
4. Keeper executes a simulated Jupiter swap (990 wSOL output)
5. Trader withdraws 987.03 wSOL (after 2.97 wSOL fee)

In production, Step 4 (execute swap) is handled by a keeper service that calls the Jupiter API, performs the actual DEX swap, then records the output amount on-chain.

**Bug fix:** The SDK PDA seed was corrected from `swap_receipt` to `receipt` to match the on-chain program.

**Run the demo:**

```bash
npx tsx scripts/demo-devnet.ts
```

## Getting Started

### Prerequisites
- Rust 1.75+
- Solana CLI 2.2+
- Anchor 0.32+
- Node.js 20+
- PostgreSQL 15+
- Noir toolchain (optional, for real ZK proofs): `nargo`, `bb`

### Installation

```bash
# Clone the repository
git clone https://github.com/psyto/meridian.git
cd meridian

# Install dependencies
yarn install

# Build Anchor programs
anchor build

# Run SDK tests (286 tests)
npx vitest run packages/sdk/src/__tests__/
npx vitest run packages/aggregator/src/__tests__/

# Run Anchor integration tests
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

## Component Sources

| Component | Key Patterns |
|-----------|--------------|
| Stablecoin | Token-2022 mint, transfer hooks, collateral management |
| Transfer Hook | KYC whitelist, jurisdiction checks, daily limits |
| Securities Engine | AMM (x*y=k), LP tokens, pool management |
| Derivatives | Perpetuals, funding rates, variance swaps |
| Oracle | TWAP, volatility index, funding feeds |
| RWA Registry | Asset registration, ownership proofs, dividends |
| Shield Escrow | Compliant hybrid liquidity, escrow-based Jupiter routing, fee collection |
| ZK Verifier | Noir proof verification, compliance attestations, kill switch |
| ZK Circuits | Noir compliance proof circuit with Pedersen commitments |
| Encryption | NaCl box encryption via @fabrknt/veil-crypto |
| Compliance | On-chain KYC (@fabrknt/accredit-core), off-chain sanctions/PEP (@fabrknt/complr-sdk) |
| Hybrid Routing | ComplianceShieldRouter for escrow-based access to full Jupiter liquidity |
| Stratum | OrderMatcher, MerkleTree for ownership proofs, Bitfield for settlement (@fabrknt/stratum-core) |
| API Layer | Next.js patterns, Prisma schema, auth |

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

## Regulatory Compliance

### Trust Scheme
- Trust-type Class 3 Electronic Payment Instrument (信託型3号電子決済手段) under Japanese PSA
- No ¥1,000,000 limit for domestic transfers
- 100% fiat collateral backing via trust structure
- 1:1 JPY redemption guaranteed
- See `docs/trust-scheme-legal.md` for the full JFSA validation checklist

### KYC/AML — Fabrknt Compliance Stack
- All transfers validated via Token-2022 transfer hook
- On-chain KYC verification via **@fabrknt/accredit-core** (whitelist entry, KYC level, jurisdiction, expiry)
- Off-chain sanctions and PEP screening via **@fabrknt/complr-sdk** (`screenWallet`, `checkTransferCompliance`)
- ZK compliance proofs for private KYC attestation (Noir circuits + on-chain verifier)
- Jurisdiction-based restrictions with bitmask enforcement
- Multi-level KYC verification (None/Basic/Standard/Enhanced/Institutional)
- Expiry and renewal management

## Partners

| Partner | Role |
|---------|------|
| **Meridian Trust Bank** | Stablecoin issuance & redemption |
| **Meridian Trading** | Distribution as electronic payment operator |

## License

