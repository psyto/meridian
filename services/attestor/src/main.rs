//! `meridian-attestor` — reads a `SwapProposal` JSON (path arg or stdin), re-executes the swap via
//! the custos-engine re-executor, and prints an `AttestVerdict` JSON.
//!
//! Signing key from `ATTESTOR_KEY_HEX` (32-byte hex); falls back to a fixed DEV key (NON-PRODUCTION).
//! Until the custos wiring lands (see `custos_reexecutor.rs`), the re-executor returns an explicit
//! error and the verdict is `Reject{reason: "replay failed: custos wiring pending ..."}` — the binary
//! runs and reports the gap rather than panicking.

use std::io::Read;

use ed25519_dalek::SigningKey;
use meridian_attestor::{
    attest, custos_reexecutor::CustosReExecutor, hex32, FixedReExecutor, ReExecutor, SwapProposal,
};

fn main() -> anyhow::Result<()> {
    let mut input = String::new();
    match std::env::args().nth(1) {
        Some(path) => input = std::fs::read_to_string(&path)?,
        None => {
            std::io::stdin().read_to_string(&mut input)?;
        }
    }
    let proposal: SwapProposal = serde_json::from_str(&input)?;

    let signer = match std::env::var("ATTESTOR_KEY_HEX") {
        Ok(h) => SigningKey::from_bytes(&hex32(&h)?),
        Err(_) => {
            eprintln!("WARN: ATTESTOR_KEY_HEX unset — using a fixed DEV key (do NOT use in production)");
            SigningKey::from_bytes(&[42u8; 32])
        }
    };

    // Local demo/test: MOCK_REEXEC_OUTPUT=<u64> pretends the replay produced that output, so the
    // attest/sign path runs end-to-end without a live engine or network. Otherwise use the real
    // (currently scaffolded) custos re-executor.
    let reexec: Box<dyn ReExecutor> = match std::env::var("MOCK_REEXEC_OUTPUT") {
        Ok(v) => {
            eprintln!("WARN: MOCK_REEXEC_OUTPUT set — using a MOCK re-executor (no real re-execution)");
            Box::new(FixedReExecutor { success: true, output: v.parse()? })
        }
        Err(_) => {
            let rpc = std::env::var("CUSTOS_RPC")
                .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".into());
            Box::new(CustosReExecutor::new(rpc))
        }
    };

    let verdict = attest(&proposal, reexec.as_ref(), &signer);
    println!("{}", serde_json::to_string_pretty(&verdict)?);
    Ok(())
}
