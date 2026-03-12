use anchor_lang::prelude::*;

/// Global configuration for the Shield Escrow program.
///
/// The escrow PDA is KYC-whitelisted, enabling compliant traders to access
/// non-KYC liquidity pools through a whitelisted intermediary.
#[account]
#[derive(InitSpace)]
pub struct ShieldConfig {
    /// Admin authority that manages the escrow
    pub authority: Pubkey,

    /// PDA authority for escrow token accounts (seed: `b"escrow_authority"`)
    pub escrow_authority: Pubkey,

    /// Transfer hook program for compliance enforcement
    pub transfer_hook_program: Pubkey,

    /// KYC registry the escrow is whitelisted in
    pub kyc_registry: Pubkey,

    /// Total number of swaps executed through the escrow
    pub total_swaps: u64,

    /// Total volume processed in base units
    pub total_volume: u64,

    /// Protocol fee in basis points (0-100, max 1%)
    pub fee_bps: u16,

    /// Recipient of protocol fees
    pub fee_recipient: Pubkey,

    /// Kill switch to pause the escrow
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed for the config PDA
    pub bump: u8,

    /// Bump seed for the escrow authority PDA
    pub escrow_authority_bump: u8,
}

impl ShieldConfig {
    pub const SEED_PREFIX: &'static [u8] = b"shield_config";
    pub const ESCROW_AUTHORITY_SEED: &'static [u8] = b"escrow_authority";
    pub const MAX_FEE_BPS: u16 = 100;

    /// Calculate the protocol fee for a given amount
    pub fn calculate_fee(&self, amount: u64) -> u64 {
        ((amount as u128 * self.fee_bps as u128) / 10000) as u64
    }
}
