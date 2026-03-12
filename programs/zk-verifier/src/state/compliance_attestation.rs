use anchor_lang::prelude::*;

/// On-chain attestation that a wallet has proven ZK compliance.
/// Created when a proof is successfully verified.
#[account]
#[derive(InitSpace)]
pub struct ComplianceAttestation {
    /// The wallet that was attested
    pub wallet: Pubkey,

    /// The verifier config that created this attestation
    pub verifier_config: Pubkey,

    /// The Pedersen commitment from the proof
    pub commitment: [u8; 32],

    /// The KYC level that was proven
    pub required_kyc_level: u8,

    /// The jurisdiction bitmask that was proven
    pub jurisdiction_bitmask: u32,

    /// When the proof was verified
    pub verified_at: i64,

    /// When this attestation expires
    pub expires_at: i64,

    /// Can be revoked by authority
    pub is_valid: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl ComplianceAttestation {
    pub const SEED_PREFIX: &'static [u8] = b"attestation";
}
