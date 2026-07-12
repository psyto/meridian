//! Production `ReExecutor` backed by custos-engine (`github.com/psyto/custos`, `engine/`).
//!
//! ## Wiring status — task 002 Part 2 (meridian-side wiring pending)
//!
//! The custos-engine seam now EXISTS: `loader::simulate_b64(tx_b64, user, rpc) -> (ScanReport,
//! Outcome)` is merged (custos), exposing the raw `Outcome { pre, post: BTreeMap<Pubkey,
//! Option<AccountSnapshot>> }` alongside the safety `ScanReport`. The remaining work is to wire THIS
//! impl to call it: clone state → replay in LiteSVM → read the escrow output-token delta from
//! `outcome.pre`/`outcome.post`, honoring `pin_slot`. Sketch:
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
