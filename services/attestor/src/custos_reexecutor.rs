//! Production `ReExecutor` backed by custos-engine (`github.com/psyto/custos`, `engine/`).
//!
//! ## Wiring status — FRAME-THIN FINDING (task 002)
//!
//! custos-engine's public entry `loader::scan_b64(tx_b64, user, rpc) -> ScanReport` clones the
//! touched mainnet accounts, dumps invoked programs, simulates in LiteSVM, and returns a **safety
//! verdict** (`ScanReport`). But `ScanReport` does **not** carry token balances — the escrow's
//! output-token *delta* we need lives on the internal `Outcome { pre, post: BTreeMap<Pubkey,
//! Option<AccountSnapshot>> }`, which `scan_b64` builds but does not return.
//!
//! **Required custos-engine change (small, isolated):** expose the Outcome, e.g.
//! `pub fn simulate_b64(tx_b64, user, rpc) -> (ScanReport, Outcome)` (or a helper
//! `output_delta(&Outcome, escrow_output_ata) -> u64`). The loader already computes it internally;
//! this is a return-signature refactor, not new logic. Then this impl becomes:
//!
//! ```ignore
//! let (report, outcome) = custos_engine::loader::simulate_b64(tx_b64, Some(user), &self.rpc);
//! // safety gate: only attest a swap custos itself rates non-RED
//! if report.level == "RED" { return Ok((false, 0)); }
//! let pre = outcome.post.get(ata)... // parse via custos_engine::TokenAccount::parse
//! let post = ...;
//! Ok((outcome.success, post.amount.saturating_sub(pre.amount)))
//! ```
//!
//! Until that lands, this impl returns an explicit error (so the binary runs and reports the gap
//! rather than panicking). Also frame-thick (→ Codex): pin the simulation slot to avoid the
//! stale-state confound custos documents in its Gate D note.

use crate::ReExecutor;

pub struct CustosReExecutor {
    pub rpc: String,
}

impl CustosReExecutor {
    pub fn new(rpc: impl Into<String>) -> Self {
        Self { rpc: rpc.into() }
    }
}

impl ReExecutor for CustosReExecutor {
    fn replay_output_delta(
        &self,
        _tx_b64: &str,
        _escrow_output_ata: &str,
        _pin_slot: u64,
    ) -> anyhow::Result<(bool, u64)> {
        // When wired: warp the LiteSVM clock to `_pin_slot` before simulating so state is
        // deterministic (custos Gate D stale-state confound), then read the escrow output delta.
        anyhow::bail!(
            "custos wiring pending: custos-engine now exposes loader::simulate_b64 -> \
             (ScanReport, Outcome) (merged), but CustosReExecutor is not yet wired to call it \
             (clone state -> replay in LiteSVM -> read escrow output delta, honoring pin_slot via \
             warp_to_slot). Task 002 Part 2. Use MOCK_REEXEC_OUTPUT for a local demo of the sign path."
        )
    }
}
