use anchor_lang::prelude::*;

/// Stablecoin standard preset
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum StablecoinPreset {
    /// SSS-1: Minimal Stablecoin — mint + freeze + metadata only
    Sss1,
    /// SSS-2: Compliant Stablecoin — SSS-1 + permanent delegate + transfer hook + blacklist
    Sss2,
    /// Custom: manually configured extensions
    Custom,
}

impl Default for StablecoinPreset {
    fn default() -> Self {
        StablecoinPreset::Sss1
    }
}

/// Role-based access control for stablecoin operations
#[account]
#[derive(InitSpace)]
pub struct RoleConfig {
    /// Master authority — can assign all other roles
    pub master_authority: Pubkey,

    /// Minter role (can mint tokens, subject to quotas)
    pub minter: Option<Pubkey>,

    /// Burner role (can burn tokens)
    pub burner: Option<Pubkey>,

    /// Blacklister role (SSS-2: can manage blacklist)
    pub blacklister: Option<Pubkey>,

    /// Pauser role (can pause/unpause)
    pub pauser: Option<Pubkey>,

    /// Seizer role (SSS-2: can seize via permanent delegate)
    pub seizer: Option<Pubkey>,

    /// Associated mint config
    pub mint_config: Pubkey,

    /// Bump seed
    pub bump: u8,
}

impl RoleConfig {
    pub const SEED_PREFIX: &'static [u8] = b"role_config";
}

/// Configuration for the stablecoin mint
#[account]
#[derive(InitSpace)]
pub struct MintConfig {
    /// Authority that can mint/burn (Trust Bank)
    pub authority: Pubkey,

    /// SPL Token-2022 mint address
    pub mint: Pubkey,

    /// Transfer hook program for KYC/AML compliance
    pub transfer_hook_program: Pubkey,

    /// Total stablecoin tokens in circulation
    pub total_supply: u64,

    /// Total fiat collateral backing (in smallest unit)
    pub total_collateral: u64,

    /// Collateral ratio in basis points (10000 = 100%)
    /// For trust-type stablecoin, should always be >= 10000
    pub collateral_ratio_bps: u64,

    /// Emergency pause flag
    pub is_paused: bool,

    /// Freeze authority for regulatory compliance
    pub freeze_authority: Option<Pubkey>,

    /// Oracle for price feed
    pub price_oracle: Option<Pubkey>,

    /// Last audit timestamp
    pub last_audit: i64,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed for PDA
    pub bump: u8,

    // =========================================================================
    // SSS preset configuration (v2)
    // =========================================================================

    /// Which preset was used to initialize this stablecoin
    pub preset: StablecoinPreset,

    /// SSS-2: Enable permanent delegate (required for seize)
    pub enable_permanent_delegate: bool,

    /// SSS-2: Enable transfer hook for compliance checks
    pub enable_transfer_hook: bool,

    /// SSS-2: New token accounts start frozen (must be thawed after KYC)
    pub default_account_frozen: bool,

    /// Token decimals (configurable per stablecoin)
    pub decimals: u8,

    /// Treasury account for seized tokens
    pub treasury: Option<Pubkey>,
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

    /// Check if SSS-2 compliance features are enabled
    pub fn is_compliant(&self) -> bool {
        matches!(self.preset, StablecoinPreset::Sss2) ||
        (self.enable_permanent_delegate && self.enable_transfer_hook)
    }
}
