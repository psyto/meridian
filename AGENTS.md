# AGENTS.md — Meridian two-agent operating contract

Meridian is built by **two agents that cross-review each other**: Claude Code (CC) and Codex.
The repo — not chat memory — is the only shared memory. **Every handoff is a committed artifact**
(task brief, code, review file).

**Current work:** revival on branch `claude/revive-aperture-custos` — replacing Meridian's two fake
trust points (keeper-posted swap; placeholder ZK) with real flagship capabilities. See `REVIVAL.md`.

## Division of labour (by task *frame*, not "implement vs review")

- **Frame thin** (exploration: vague goal, unknown state, trial-and-error) → **CC**. Owns:
  architecture, the revival design (`REVIVAL.md`), task briefs, exploratory scaffolds, and the final
  "is this explainable / safe to operate?" pass.
- **Frame thick** (convergence: clear diff, fixed perspective, converging answer) → **Codex**. Owns:
  implementing tightly-specified briefs, and **adversarial audits/reviews**.

**Product-specific:** Meridian's whole pitch is *provable* institutional DeFi access — every swap
re-executed/attested, compliance selectively disclosed. So Codex is the natural **independent
red-teamer** against the attestation/verification logic: a different model trying to forge an
attestation or bypass the co-sign is worth more than CC checking its own work.

**Cross-pass rule:** whoever implemented a change is NOT its reviewer. The other agent reviews. A
change merges only after a review by the other agent.

## Workflow (brief → branch → review → merge)

1. **Brief.** CC writes a task brief in `docs/tasks/NNN-slug.md` (goal, scope, acceptance, out-of-scope,
   files). Make the brief thick before handing to Codex.
2. **Branch.** One task per branch (`claude/...` / `codex/...` / `task/NNN-slug`). Never pile unrelated
   work onto someone else's branch.
3. **Implement.** The assigned agent implements on that branch, commits small and often.
4. **Review.** The OTHER agent reviews the branch diff and writes `reviews/NNN-slug.md` (verdict
   APPROVE / CHANGES, prioritized P0/P1/P2). Adversarial: forged attestations, bypassed co-sign,
   untested error paths, correctness. Iterate to APPROVE.
5. **Merge.** Only an APPROVED branch merges. No agent merges its own un-reviewed work.

**Review surface — GitHub PRs preferred** (`gh pr create` / `gh pr diff`). Local fallback: exchange
`reviews/NNN-slug.md` files.

## The contract (neither agent changes unilaterally — needs a brief/ADR both see)

- `programs/shield-escrow` — `ShieldConfig.attestor_pubkey`, `execute_swap` attestor co-sign model,
  `SwapReceipt`. (Detached ed25519 attestation is the planned refinement — REVIVAL.md 1b.)
- `programs/zk-verifier` — `verify_proof` / attestation lifecycle (→ aperture, REVIVAL.md 2).

## Gates (must hold before review is requested)

- `cargo check` clean (no new warnings from the touched crate); `anchor build` for on-chain changes.
- `turbo run test` green; new branching logic ships with tests; tests stay offline (no network).
- **No secrets committed.** Repo is **PUBLIC** — secret-scan before every push; keys live in env only.

## Git hygiene

- Branch from `master`; rebase (not merge commits). Commit as `psyto <saito.hiroyuki@gmail.com>`.
- Repo is **PUBLIC** — do not commit anything you would not publish; do not change visibility unasked.

## Running Codex (repo at /Users/hiroyusai/src/meridian; codex is not on PATH)

```bash
CODEX=/Applications/Codex.app/Contents/Resources/codex
# Review (read-only):
"$CODEX" exec -C /Users/hiroyusai/src/meridian -s read-only "<review prompt: branch + reviews/NNN file>"
# Implement on a branch (writes):
"$CODEX" exec -C /Users/hiroyusai/src/meridian -s workspace-write -o /tmp/codex-out.md "<task brief ref>"
```
