use anchor_lang::prelude::*;

/// Configuration for the ZK verifier, storing the verification key
/// and circuit identifier for Noir compliance proofs.
#[account]
#[derive(InitSpace)]
pub struct VerifierConfig {
    /// Admin authority
    pub authority: Pubkey,

    /// Hash identifier for the circuit (SHA-256 of circuit bytecode)
    pub circuit_id: [u8; 32],

    /// Truncated verification key bytes
    pub verification_key: [u8; 128],

    /// Total successful verifications
    pub total_verifications: u64,

    /// Total rejected proofs
    pub total_rejections: u64,

    /// Kill switch
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed for PDA
    pub bump: u8,
}

impl VerifierConfig {
    pub const SEED_PREFIX: &'static [u8] = b"verifier_config";
}
