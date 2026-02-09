use anchor_lang::prelude::*;

/// Collateral vault tracking fiat reserves
#[account]
#[derive(InitSpace)]
pub struct CollateralVault {
    /// Associated JPY mint config
    pub mint_config: Pubkey,

    /// Total fiat collateral held (in smallest unit)
    pub total_collateral: u64,

    /// Vault authority (Trust Bank)
    pub authority: Pubkey,

    /// Auditor public key for verification
    pub auditor: Option<Pubkey>,

    /// Last audit proof hash (SHA-256)
    pub last_audit_hash: [u8; 32],

    /// Last audit timestamp
    pub last_audit_at: i64,

    /// Collateral type
    pub collateral_type: CollateralType,

    /// Vault status
    pub status: VaultStatus,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CollateralType {
    /// Japanese Yen fiat held in trust bank
    FiatJpy,
    /// Japanese Government Bonds (JGB)
    Jgb,
    /// Bank deposits
    BankDeposit,
    /// Other approved collateral
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultStatus {
    /// Vault is active and accepting deposits
    Active,
    /// Vault is temporarily suspended
    Suspended,
    /// Vault is under audit
    UnderAudit,
    /// Vault is closed
    Closed,
}

impl CollateralVault {
    pub const SEED_PREFIX: &'static [u8] = b"collateral_vault";

    pub fn is_active(&self) -> bool {
        matches!(self.status, VaultStatus::Active)
    }

    pub fn can_withdraw(&self, amount: u64) -> bool {
        self.is_active() && self.total_collateral >= amount
    }
}
