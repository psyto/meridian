use anchor_lang::prelude::*;

#[error_code]
pub enum ComplianceError {
    #[msg("Unauthorized: signer is not the registry authority")]
    Unauthorized,

    #[msg("Pool is already registered in this registry")]
    PoolAlreadyRegistered,

    #[msg("Pool is not in active status")]
    PoolNotActive,

    #[msg("Pool is already suspended")]
    PoolAlreadySuspended,

    #[msg("Pool is already revoked and cannot be reinstated")]
    PoolAlreadyRevoked,

    #[msg("Pool status does not allow this operation")]
    InvalidPoolStatus,

    #[msg("Pool audit has expired")]
    AuditExpired,

    #[msg("KYC level does not meet minimum requirement")]
    InsufficientKycLevel,

    #[msg("Jurisdiction is not allowed")]
    JurisdictionNotAllowed,

    #[msg("Route contains non-compliant pool")]
    NonCompliantRoute,

    #[msg("Registry is not active")]
    RegistryInactive,

    #[msg("Compliance config is not active")]
    ComplianceConfigInactive,

    #[msg("Trade amount exceeds limit for this KYC level")]
    TradeLimitExceeded,

    #[msg("Empty route provided")]
    EmptyRoute,

    #[msg("Route exceeds maximum hop count")]
    RouteTooLong,
}
