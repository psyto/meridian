//! Off-chain **custos-engine attestor** for Meridian's shield-escrow (REVIVAL.md 1c / task 002).
//!
//! This is the service that makes the on-chain co-sign (task 001) *mean* something: it
//! independently **re-executes the keeper's proposed Jupiter swap** and attests only when the
//! re-executed output actually meets the reported amount. Without it, the attestor key is just a
//! second rubber-stamp.
//!
//! Frame split (AGENTS.md):
//! - **CC (this scaffold):** the shape, the decision logic, ed25519 signing, and the seam to
//!   custos-engine (`ReExecutor`). Fully unit-tested via `MockReExecutor` — offline, no network.
//! - **→ Codex (frame-thick convergence):** the exact `bind_message` byte layout (must match the
//!   on-chain detached-attestation verify, slice 1b), nonce/replay binding, and stale-state slot
//!   pinning. See task 002 §"Frame-thick".

use ed25519_dalek::{Signature, Signer, SigningKey};
use serde::{Deserialize, Serialize};

pub mod custos_reexecutor;

/// A swap the keeper proposes to settle on-chain via `shield_escrow::execute_swap`.
/// Keys are hex (32-byte) so the JSON is human-readable; `tx_b64` is the *exact* tx the keeper
/// will submit, so the attestor replays precisely what settles.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapProposal {
    pub tx_b64: String,
    /// The escrow's output-token account; its balance gain from the replay is the swap output.
    pub escrow_output_ata: String,
    pub output_mint: String,
    pub trader: String,
    pub nonce: u64,
    /// Gross output the keeper reports. We attest iff `reexec_output >= proposed_output_amount`.
    pub proposed_output_amount: u64,
    /// Protocol fee (bps) the escrow deducts — MUST equal `ShieldConfig.fee_bps` at settle time.
    /// Needed so the attestor enforces the trader minimum on the NET (post-fee) amount, matching
    /// on-chain task 001 (`net_output >= min_output_amount`).
    pub fee_bps: u16,
    /// Trader's minimum — enforced here on the NET amount, mirroring on-chain task 001.
    pub min_output_amount: u64,
    /// Mainnet slot the attestor pins the re-execution to (resolves the stale-state false
    /// accept/reject confound custos flags in its Gate D note). Bound into the signed message.
    pub execution_slot: u64,
}

/// The attestor's decision. `Sign` carries the exact signed bytes + signature + pubkey so the
/// keeper can submit a detached attestation on-chain (slice 1b) or the attestor can co-sign now.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "snake_case")]
pub enum AttestVerdict {
    Sign {
        message_hex: String,
        signature_hex: String,
        attestor_pubkey_hex: String,
    },
    Reject {
        reason: String,
    },
}

/// Abstracts "replay the proposed swap and read the escrow's output-token gain".
/// Production impl = custos-engine (LiteSVM vs cloned mainnet); `MockReExecutor` drives tests.
pub trait ReExecutor {
    /// `Ok((success, reexec_output_delta))` — did the replayed tx succeed, and how much did the
    /// escrow output ATA gain — or `Err` if the tx cannot be deterministically replayed.
    ///
    /// `pin_slot` is the mainnet slot the re-execution MUST pin cloned state to (custos
    /// `warp_to_slot`), so the attestation reflects a deterministic, agreed state — not "whatever
    /// the RPC serves now". Bound into the signed message by `bind_message`.
    fn replay_output_delta(
        &self,
        tx_b64: &str,
        escrow_output_ata: &str,
        pin_slot: u64,
    ) -> anyhow::Result<(bool, u64)>;
}

/// The bound message an attestation signs.
///
/// **EXACT LAYOUT IS A CODEX CONVERGENCE POINT** — it must byte-for-byte equal the on-chain
/// detached-attestation verify (slice 1b). Layout (all LE):
/// `trader(32) | nonce(8) | output_mint(32) | proposed_output_amount(8) | fee_bps(2) |
/// execution_slot(8) | sha256(tx_b64)(32)`.
///
/// - `nonce`+`trader` prevent reuse across the trader's swaps.
/// - `sha256(tx_b64)` binds the attestation to the **exact replayed swap** — a detached attestation
///   cannot be reused against a different off-chain execution claiming the same output (Codex 002 P1).
/// - `fee_bps` + `execution_slot` bind the fee assumption and the pinned state.
pub fn bind_message(p: &SwapProposal) -> anyhow::Result<Vec<u8>> {
    use sha2::{Digest, Sha256};
    let trader = hex32(&p.trader)?;
    let mint = hex32(&p.output_mint)?;
    let tx_hash = Sha256::digest(p.tx_b64.as_bytes());
    let mut m = Vec::with_capacity(32 + 8 + 32 + 8 + 2 + 8 + 32);
    m.extend_from_slice(&trader);
    m.extend_from_slice(&p.nonce.to_le_bytes());
    m.extend_from_slice(&mint);
    m.extend_from_slice(&p.proposed_output_amount.to_le_bytes());
    m.extend_from_slice(&p.fee_bps.to_le_bytes());
    m.extend_from_slice(&p.execution_slot.to_le_bytes());
    m.extend_from_slice(&tx_hash);
    Ok(m)
}

/// Re-execute the proposal and, iff it checks out, sign the bound message.
///
/// Attest rules (all must hold): replay succeeds · `reexec_output >= proposed_output_amount`
/// (keeper did not overstate the gross) · the **NET** amount (post-fee, matching on-chain task 001)
/// `>= min_output_amount`. Signs a message bound to the exact replayed tx + pinned slot.
pub fn attest(p: &SwapProposal, reexec: &dyn ReExecutor, signer: &SigningKey) -> AttestVerdict {
    let (success, reexec_output) =
        match reexec.replay_output_delta(&p.tx_b64, &p.escrow_output_ata, p.execution_slot) {
            Ok(v) => v,
            Err(e) => return AttestVerdict::Reject { reason: format!("replay failed: {e}") },
        };
    if !success {
        return AttestVerdict::Reject { reason: "re-executed swap did not succeed".into() };
    }
    if reexec_output < p.proposed_output_amount {
        return AttestVerdict::Reject {
            reason: format!("re-exec output {reexec_output} < reported {}", p.proposed_output_amount),
        };
    }
    // NET slippage, mirroring on-chain task 001: the escrow deducts `fee_bps` from the reported
    // gross, and the trader minimum applies to what they actually withdraw (net). Signing a proposal
    // whose net falls below the minimum would attest a swap `execute_swap` must reject.
    let fee = ((p.proposed_output_amount as u128 * p.fee_bps as u128) / 10_000) as u64;
    let net_output = p.proposed_output_amount.saturating_sub(fee);
    if net_output < p.min_output_amount {
        return AttestVerdict::Reject {
            reason: format!("net output {net_output} (after {}bps fee) below trader minimum {}", p.fee_bps, p.min_output_amount),
        };
    }
    let msg = match bind_message(p) {
        Ok(m) => m,
        Err(e) => return AttestVerdict::Reject { reason: format!("bad proposal keys: {e}") },
    };
    let sig: Signature = signer.sign(&msg);
    AttestVerdict::Sign {
        message_hex: hex::encode(&msg),
        signature_hex: hex::encode(sig.to_bytes()),
        attestor_pubkey_hex: hex::encode(signer.verifying_key().to_bytes()),
    }
}

/// A fixed-output `ReExecutor` for **local demos/tests only** (NOT production): it pretends the
/// replay succeeded and produced `output`, so the attest/sign path can be exercised end-to-end
/// without a live engine or network. The CLI enables it via `MOCK_REEXEC_OUTPUT`.
pub struct FixedReExecutor {
    pub success: bool,
    pub output: u64,
}
impl ReExecutor for FixedReExecutor {
    fn replay_output_delta(&self, _tx: &str, _ata: &str, _pin_slot: u64) -> anyhow::Result<(bool, u64)> {
        Ok((self.success, self.output))
    }
}

pub fn hex32(s: &str) -> anyhow::Result<[u8; 32]> {
    let v = hex::decode(s.trim_start_matches("0x"))?;
    v.as_slice()
        .try_into()
        .map_err(|_| anyhow::anyhow!("expected 32-byte hex, got {} bytes", v.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockReExecutor {
        success: bool,
        delta: u64,
        err: bool,
    }
    impl ReExecutor for MockReExecutor {
        fn replay_output_delta(&self, _tx: &str, _ata: &str, _pin_slot: u64) -> anyhow::Result<(bool, u64)> {
            if self.err {
                anyhow::bail!("mock replay error");
            }
            Ok((self.success, self.delta))
        }
    }

    fn proposal_fee(proposed: u64, min: u64, fee_bps: u16) -> SwapProposal {
        SwapProposal {
            tx_b64: "AA==".into(),
            escrow_output_ata: hex::encode([1u8; 32]),
            output_mint: hex::encode([2u8; 32]),
            trader: hex::encode([3u8; 32]),
            nonce: 7,
            proposed_output_amount: proposed,
            fee_bps,
            min_output_amount: min,
            execution_slot: 123_456,
        }
    }
    fn proposal(proposed: u64, min: u64) -> SwapProposal {
        proposal_fee(proposed, min, 0)
    }
    fn signer() -> SigningKey {
        SigningKey::from_bytes(&[9u8; 32])
    }

    #[test]
    fn signs_when_reexec_meets_reported_output() {
        let v = attest(&proposal(2_000_000, 1_000_000), &MockReExecutor { success: true, delta: 2_000_000, err: false }, &signer());
        match v {
            AttestVerdict::Sign { message_hex, signature_hex, attestor_pubkey_hex } => {
                assert_eq!(message_hex.len(), (32 + 8 + 32 + 8 + 2 + 8 + 32) * 2);
                assert_eq!(signature_hex.len(), 128);
                assert_eq!(attestor_pubkey_hex.len(), 64);
            }
            AttestVerdict::Reject { reason } => panic!("expected Sign, got Reject: {reason}"),
        }
    }

    #[test]
    fn rejects_when_net_below_min_after_fee() {
        // gross 1_000_000 clears min 1_000_000, but a 25bps fee -> net 997_500 < min: on-chain
        // (task 001) would reject, so the attestor must not sign.
        let v = attest(
            &proposal_fee(1_000_000, 1_000_000, 25),
            &MockReExecutor { success: true, delta: 1_000_000, err: false },
            &signer(),
        );
        assert!(matches!(v, AttestVerdict::Reject { .. }), "net-below-min must be rejected");
    }

    #[test]
    fn rejects_when_keeper_overstates_output() {
        // reported 2_000_000 but the swap only actually produced 1_500_000.
        let v = attest(&proposal(2_000_000, 1_000_000), &MockReExecutor { success: true, delta: 1_500_000, err: false }, &signer());
        assert!(matches!(v, AttestVerdict::Reject { .. }));
    }

    #[test]
    fn rejects_when_replay_fails() {
        let v = attest(&proposal(2_000_000, 1_000_000), &MockReExecutor { success: false, delta: 2_000_000, err: false }, &signer());
        assert!(matches!(v, AttestVerdict::Reject { .. }));
        let v2 = attest(&proposal(2_000_000, 1_000_000), &MockReExecutor { success: true, delta: 0, err: true }, &signer());
        assert!(matches!(v2, AttestVerdict::Reject { .. }));
    }

    #[test]
    fn rejects_when_reported_below_trader_minimum() {
        let v = attest(&proposal(900_000, 1_000_000), &MockReExecutor { success: true, delta: 900_000, err: false }, &signer());
        assert!(matches!(v, AttestVerdict::Reject { .. }));
    }

    #[test]
    fn signature_verifies_against_the_bound_message() {
        let p = proposal(2_000_000, 1_000_000);
        let sk = signer();
        let v = attest(&p, &MockReExecutor { success: true, delta: 2_000_000, err: false }, &sk);
        if let AttestVerdict::Sign { message_hex, signature_hex, .. } = v {
            use ed25519_dalek::Verifier;
            let msg = hex::decode(message_hex).unwrap();
            let sig = Signature::from_bytes(&hex::decode(signature_hex).unwrap().try_into().unwrap());
            assert!(sk.verifying_key().verify(&msg, &sig).is_ok());
            // message binds the exact reported terms
            assert_eq!(msg, bind_message(&p).unwrap());
        } else {
            panic!("expected Sign");
        }
    }
}
