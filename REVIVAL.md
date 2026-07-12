# Meridian Revival — Verifiable Institutional DeFi Access

**Branch:** `claude/revive-aperture-custos` · started 2026-07-12

## Thesis
Meridian was ~built (Solana/Anchor, shield escrow, Token-2022 compliance hooks,
`@fabrknt/accredit-core` + `@fabrknt/complr-sdk`, dashboard + demo videos + pitch deck)
but stalled because the **two trust-critical points were fake**:

1. **`shield-escrow::execute_swap`** — the keeper posts `output_amount` with **no on-chain
   verification** that the off-chain Jupiter swap actually happened at that price.
2. **`zk-verifier::verify_proof`** — `verify_proof_inputs` is a **placeholder** (non-zero byte
   check only); any non-zero proof is accepted.

Revival = replace both with proven flagship capabilities:
> **KYC'd capital accesses Jupiter DEX with every swap independently re-executed & attested,
> and compliance proven via selective disclosure — positions never revealed.**

Capability map: **custos-engine** (LiteSVM re-execution + attestation) fixes #1 ·
**aperture** (Token-2022 selective disclosure) fixes #2 · **accredit/complr** (already wired)
= KYC/AML. This is the `probatio+aperture` "prove-without-reveal finance" engine, Solana side.

---

## Slice 1 — attestor co-sign in shield-escrow ✅ (this branch, compiles)
- `ShieldConfig.attestor_pubkey` added (pinned key, set at `initialize`).
- `execute_swap` now **requires the pinned attestor to co-sign** (new `attestor: Signer`
  constrained to `shield_config.attestor_pubkey`). The attestor is the **custos-engine
  operator** who replays the proposed Jupiter swap in LiteSVM against cloned mainnet state and
  only co-signs when the re-executed output matches the reported `output_amount`.
- Trust model: *keeper alone* → *keeper proposes + independent re-executing attestor co-signs.*
- `SwapExecutedEvent.attestor` emitted for audit. `cargo check -p shield-escrow` green.

## Next slices (designed, not yet built)
**1b — detached ed25519 attestation (production refinement).** Instead of live co-signing, the
attestor signs a detached message binding `(trader, nonce, input_mint, output_mint,
input_amount, output_amount)`; the keeper submits it; `execute_swap` verifies it via the
Ed25519 native program + Instructions-sysvar introspection — the **probatio-xvm `verify_as`
pattern**. Decouples the attestor (offline/batchable) and binds explicit terms. Add attestor
key rotation to `update_config`.

**1c — off-chain custos-engine attestor service.** A service built on
[`psyto/custos`](https://github.com/psyto/custos) `custos-engine`: fetch the proposed Jupiter
route, clone the touched mainnet accounts, replay in LiteSVM, confirm `re-exec output ≥
reported`, then sign. **Same engine as OpsRail's Reliability leg** — custos gets a second
product home.

**2 — `zk-verifier` → aperture selective disclosure.** Replace the `verify_proof_inputs`
placeholder with [`aperture`](https://github.com/psyto/aperture) (Token-2022 selective
disclosure; Meridian already uses Token-2022 hooks). **Upstream gate:** aperture's on-mainnet
ZK is currently RED (not yet mainnet) — until then keep the placeholder loudly marked, or use
aperture's non-ZK disclosure path. Do this slice when aperture matures.

---

## Demand probe (run before heavy further build — demand-first)
Take the **existing** `demo-cli.mp4` / `demo-dashboard.mp4` + `pitch-deck.html` + this upgraded
trust model to a **warm overseas crypto compliant-capital buyer** (Lane 1 in the enterprise-access
routing). Ask: *"Would you deploy into Solana DeFi if every swap were independently
re-executed/attested and compliance were provable via selective disclosure, positions
unrevealed?"* Build the remaining slices only if a buyer raises a hand.
