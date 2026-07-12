//! Production `ReExecutor` backed by custos-engine (`github.com/psyto/custos`, `engine/`) — the same
//! LiteSVM re-execution engine as OpsRail's reliability leg.
//!
//! ## What it does (task 002 Part 2 — wired)
//!
//! Given the keeper's proposed swap tx, it calls `custos_engine::loader::simulate_b64`, which clones
//! the touched mainnet accounts, dumps the invoked programs, and replays the tx in LiteSVM, returning
//! the raw `Outcome { pre, post }`. We read the **escrow output-token delta** (`post − pre` of the
//! escrow output ATA) via `custos_engine::TokenAccount::parse`, and return `(success, delta)` so
//! `attest()` can decide whether the re-executed output backs the keeper's reported amount.
//!
//! ## Honest limits (frame-thick → Codex)
//! - **Runs against LIVE state / needs network:** `simulate_b64` fetches mainnet accounts over RPC
//!   (`CUSTOS_RPC` / mainnet-beta). It cannot run in a network-isolated environment.
//! - **`pin_slot` not yet honored:** `simulate_b64` clones state at the CURRENT slot; true historical
//!   pinning to `pin_slot` needs archival state fetch (custos Gate D stale-state confound). `pin_slot`
//!   is still bound into the attestation, but the re-execution reflects current state for now.
//! - **Panic safety:** `simulate_b64` `expect()`s on malformed tx / RPC shape; wrapped in
//!   `catch_unwind` so a bad keeper input becomes an `Err` (→ `Reject`), not a crash.

use std::collections::BTreeMap;
use std::panic::{catch_unwind, AssertUnwindSafe};

use custos_engine::{loader, AccountSnapshot, TokenAccount};
use solana_pubkey::Pubkey;

use crate::{hex32, ReExecutor};

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
        tx_b64: &str,
        escrow_output_ata: &str,
        _pin_slot: u64,
    ) -> anyhow::Result<(bool, u64)> {
        let ata = Pubkey::new_from_array(hex32(escrow_output_ata)?);

        let rpc = self.rpc.clone();
        let tx = tx_b64.to_string();
        let (_report, outcome) =
            catch_unwind(AssertUnwindSafe(|| loader::simulate_b64(&tx, None, &rpc)))
                .map_err(|_| anyhow::anyhow!("custos simulate_b64 failed (malformed tx or RPC error)"))?;

        // Escrow output-token balance before/after the replayed swap.
        let balance_of = |m: &BTreeMap<Pubkey, Option<AccountSnapshot>>| -> u64 {
            m.get(&ata)
                .and_then(|o| o.as_ref())
                .and_then(TokenAccount::parse)
                .map(|t| t.amount)
                .unwrap_or(0)
        };
        let pre = balance_of(&outcome.pre);
        let post = balance_of(&outcome.post);

        Ok((outcome.success, post.saturating_sub(pre)))
    }
}
