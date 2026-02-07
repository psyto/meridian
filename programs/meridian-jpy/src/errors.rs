use anchor_lang::prelude::*;

#[error_code]
pub enum MeridianError {
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    #[msg("Mint is currently paused")]
    MintPaused,

    #[msg("Mint is already paused")]
    AlreadyPaused,

    #[msg("Mint is not paused")]
    NotPaused,

    #[msg("Invalid mint address")]
    InvalidMint,

    #[msg("Issuer is inactive")]
    IssuerInactive,

    #[msg("Invalid issuer")]
    InvalidIssuer,

    #[msg("Insufficient collateral to mint")]
    InsufficientCollateral,

    #[msg("Daily limit exceeded")]
    DailyLimitExceeded,

    #[msg("Insufficient supply to burn")]
    InsufficientSupply,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Vault is inactive")]
    VaultInactive,

    #[msg("Collateral ratio violation: must maintain 100% backing")]
    CollateralRatioViolation,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("KYC verification required")]
    KycRequired,

    #[msg("KYC verification expired")]
    KycExpired,

    #[msg("Transfer not allowed: compliance check failed")]
    ComplianceCheckFailed,

    #[msg("Jurisdiction not supported")]
    UnsupportedJurisdiction,
}
