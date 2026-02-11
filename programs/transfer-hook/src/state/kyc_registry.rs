use anchor_lang::prelude::*;

/// KYC Registry for managing verified wallets
#[account]
#[derive(InitSpace)]
pub struct KycRegistry {
    /// Registry authority (compliance officer)
    pub authority: Pubkey,

    /// Associated stablecoin mint
    pub mint: Pubkey,

    /// Total whitelisted wallets
    pub whitelist_count: u32,

    /// Is registry active
    pub is_active: bool,

    /// Require KYC for all transfers
    pub require_kyc: bool,

    /// Allow transfers between verified wallets only
    pub verified_only: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl KycRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"kyc_registry";

    pub fn is_active(&self) -> bool {
        self.is_active
    }
}
