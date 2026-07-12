# Task 001 — Shield-escrow: independent attestor co-sign

**Owner:** CC (implemented) · **Reviewer:** Codex (cross-pass) · **Branch:** `claude/revive-aperture-custos`

## Goal
Kill the trust-critical defect in `shield-escrow::execute_swap`: the keeper posts `output_amount`
with **no verification** that the off-chain Jupiter swap actually happened at that price. Introduce
an **independent re-execution attestor** (the custos-engine operator) whose co-signature is required.

## Scope (done in this slice)
- `ShieldConfig.attestor_pubkey: Pubkey` — pinned attestor key, set at `initialize`
  (rejects `Pubkey::default()`).
- `execute_swap` — new `attestor: Signer` account constrained to `shield_config.attestor_pubkey`
  (new error `InvalidAttestor`). The attestor re-executes the proposed swap in LiteSVM vs cloned
  mainnet state (off-chain, custos-engine) and only co-signs when re-exec output matches the reported
  `output_amount`. `SwapExecutedEvent.attestor` emitted for audit.
- `initialize` / `lib.rs` signatures threaded with `attestor_pubkey`; `ShieldInitialized` event updated.

## Acceptance criteria
- `cargo check -p shield-escrow` clean (met — only pre-existing glob-reexport warnings).
- Trust model is now two-party: keeper proposes, independent attestor co-signs; neither alone can
  complete a swap with a fabricated output.

## Out of scope (later slices — REVIVAL.md)
- **1b** detached ed25519 attestation (probatio-xvm `verify_as` pattern) + attestor key rotation.
- **1c** off-chain custos-engine attestor service (the actual LiteSVM re-execution + signing).
- **2** `zk-verifier` → aperture (gated on aperture mainnet-ZK maturity).

## Review ask (Codex, adversarial)
Try to break the two-party model: can `execute_swap` complete with a wrong `output_amount` if the
attestor is honest? Can the attestor co-sign be spoofed/omitted? Is `min_output_amount` still
meaningful? Any account-constraint or PDA-seed gap? Missing tests for the new `InvalidAttestor` path.
Verdict + P0/P1/P2 in `reviews/001-shield-escrow-attestor-cosign.md`.
