use anchor_lang::prelude::*;

/// Error codes for Meridian Stablecoin
#[error_code]
pub enum MeridianError {
    /// Unauthorized: caller is not the authority
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    /// Mint is currently paused
    #[msg("Mint is currently paused")]
    MintPaused,

    /// Mint is already paused
    #[msg("Mint is already paused")]
    AlreadyPaused,

    /// Mint is not paused
    #[msg("Mint is not paused")]
    NotPaused,

    /// Invalid mint address
    #[msg("Invalid mint address")]
    InvalidMint,

    /// Issuer is inactive
    #[msg("Issuer is inactive")]
    IssuerInactive,

    /// Invalid issuer
    #[msg("Invalid issuer")]
    InvalidIssuer,

    /// Insufficient collateral to mint
    #[msg("Insufficient collateral to mint")]
    InsufficientCollateral,

    /// Daily limit exceeded
    #[msg("Daily limit exceeded")]
    DailyLimitExceeded,

    /// Insufficient supply to burn
    #[msg("Insufficient supply to burn")]
    InsufficientSupply,

    /// Insufficient balance
    #[msg("Insufficient balance")]
    InsufficientBalance,

    /// Vault is inactive
    #[msg("Vault is inactive")]
    VaultInactive,

    /// Collateral ratio violation: must maintain 100% backing
    #[msg("Collateral ratio violation: must maintain 100% backing")]
    CollateralRatioViolation,

    /// Math overflow
    #[msg("Math overflow")]
    MathOverflow,

    /// Invalid amount: must be greater than zero
    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    /// KYC verification required
    #[msg("KYC verification required")]
    KycRequired,

    /// KYC verification expired
    #[msg("KYC verification expired")]
    KycExpired,

    /// Transfer not allowed: compliance check failed
    #[msg("Transfer not allowed: compliance check failed")]
    ComplianceCheckFailed,

    /// Jurisdiction not supported
    #[msg("Jurisdiction not supported")]
    UnsupportedJurisdiction,

    /// Permanent delegate not enabled for this stablecoin
    #[msg("Permanent delegate not enabled: initialize with SSS-2 preset")]
    PermanentDelegateNotEnabled,

    /// Seize requires a treasury account
    #[msg("Treasury not configured: set treasury before seizing")]
    TreasuryNotConfigured,

    /// Compliance module not enabled
    #[msg("Compliance module not enabled for this preset")]
    ComplianceModuleNotEnabled,

    /// Account is not frozen (seize requires frozen account)
    #[msg("Account must be frozen before seize")]
    AccountNotFrozen,

    /// Invalid role: caller does not have the required role
    #[msg("Caller does not have the required role")]
    InvalidRole,
}
