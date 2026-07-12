# Task 002 — Off-chain custos-engine attestor service (REVIVAL.md 1c)

**Owner:** CC (frame-thin exploration + scaffold) · security-critical convergence → Codex (frame-thick)
**Depends on:** Task 001 (on-chain co-sign) merged. **Branch:** `claude/custos-attestor-service` (new)

## Goal
Make the on-chain co-sign (Task 001) *mean* something: build the off-chain service that actually
**re-executes the proposed Jupiter swap and decides whether to attest**. Without it, the attestor
key is just a second rubber-stamp. This service IS the "independent re-execution."

## What it does (happy path)
1. Receives a proposed swap: `{ trader, nonce, input_mint, output_mint, input_amount,
   proposed_output_amount, jupiter_route / raw swap ixs }`.
2. Clones the touched mainnet accounts (custos-engine loader pattern) into LiteSVM at current state.
3. Replays the swap instructions in LiteSVM against that cloned state.
4. Reads the *re-executed* output amount from post-state.
5. Attests **iff** `reexec_output >= proposed_output_amount` (i.e., keeper did not overstate) AND
   `reexec_output >= min_output_amount`. Attestation = co-sign the `execute_swap` tx (Task 001 form)
   now; detached ed25519 attestation later (Task 003 / REVIVAL.md 1b).

## Reuse (do NOT rebuild)
- **custos-engine** (`github.com/psyto/custos`, `engine/`): LiteSVM sim + mainnet account clone +
  program dump + post-state read. Same engine as OpsRail's Reliability leg. Pull as a git/path dep.
- Signing key: the keypair whose pubkey == `ShieldConfig.attestor_pubkey`.

## Frame-thin (CC) — exploratory questions to resolve first
- How to obtain the Jupiter route as replayable instructions (Jupiter API `swap-instructions` vs the
  keeper handing us the exact ixs it will/did submit)? Cleanest: the keeper submits its intended swap
  ixs; the attestor replays those exact ixs → binds attestation to the real submitted swap.
- Which accounts to clone (Jupiter is deep-CPI; custos already handles ALT + program dump — verify the
  Jupiter route's account set is bounded, as custos measured: 14–29 accts / 4–8 programs).
- Tolerance / slippage handling: attest on `>=` proposed, or within a stated band? State the rule.

## Frame-thick (→ Codex) — security convergence
- Replay-attack / nonce binding: attestation must bind to `(trader, nonce)` so it can't be reused.
- Stale-state confound (custos Gate D note): current-slot state vs the keeper's execution slot — how to
  avoid a false reject/accept. Define the slot/state the attestor pins.
- Signature format + the exact bytes signed (for the Task 003 detached-attestation on-chain verify).

## Acceptance
- Given a proposed swap + submitted ixs, the service returns SIGN / REJECT from a real LiteSVM
  re-execution (no mocks), and a benign real Jupiter swap → SIGN, an overstated `output_amount` →
  REJECT. Offline-testable (custos clones state; no live signing key in tests).

## Out of scope
- Production key management / HSM / HA. Detached ed25519 on-chain verify = Task 003 (REVIVAL.md 1b).
