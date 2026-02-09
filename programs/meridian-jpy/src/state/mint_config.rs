use anchor_lang::prelude::*;

/// Configuration for the JPY stablecoin mint
#[account]
#[derive(InitSpace)]
pub struct MintConfig {
    /// Authority that can mint/burn (Trust Bank)
    pub authority: Pubkey,

    /// SPL Token-2022 mint address
    pub mint: Pubkey,

    /// Transfer hook program for KYC/AML compliance
    pub transfer_hook_program: Pubkey,

    /// Total JPY tokens in circulation
    pub total_supply: u64,

    /// Total fiat collateral backing (in smallest JPY unit - 1 = ¥0.01)
    pub total_collateral: u64,

    /// Collateral ratio in basis points (10000 = 100%)
    /// For trust-type stablecoin, should always be >= 10000
    pub collateral_ratio_bps: u64,

    /// Emergency pause flag
    pub is_paused: bool,

    /// Freeze authority for regulatory compliance
    pub freeze_authority: Option<Pubkey>,

    /// Oracle for JPY/USD price feed
    pub price_oracle: Option<Pubkey>,

    /// Last audit timestamp
    pub last_audit: i64,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed for PDA
    pub bump: u8,
}

impl MintConfig {
    pub const SEED_PREFIX: &'static [u8] = b"mint_config";

    /// Calculate current collateral ratio
    pub fn calculate_collateral_ratio(&self) -> u64 {
        if self.total_supply == 0 {
            return 10000; // 100% if no supply
        }
        ((self.total_collateral as u128 * 10000) / self.total_supply as u128) as u64
    }

    /// Check if minting is allowed
    pub fn can_mint(&self, amount: u64) -> bool {
        !self.is_paused &&
        self.total_collateral >= self.total_supply.saturating_add(amount)
    }

    /// Check if burning is allowed
    pub fn can_burn(&self, amount: u64) -> bool {
        !self.is_paused && self.total_supply >= amount
    }
}
