use anchor_lang::prelude::*;

/// Error codes for ZK Verifier
#[error_code]
pub enum ZkVerifierError {
    /// Verifier is deactivated
    #[msg("Verifier is deactivated")]
    VerifierNotActive,

    /// Proof expiry is in the past
    #[msg("Proof expiry is in the past")]
    ProofExpired,

    /// Proof verification failed
    #[msg("Proof verification failed")]
    ProofInvalid,

    /// Attestation has expired
    #[msg("Attestation has expired")]
    AttestationExpired,

    /// Attestation was revoked
    #[msg("Attestation was revoked")]
    AttestationRevoked,

    /// No attestation for wallet
    #[msg("No attestation found for wallet")]
    AttestationNotFound,

    /// Caller is not authority
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    /// KYC level out of range (0-4)
    #[msg("Invalid KYC level: must be 0-4")]
    InvalidKycLevel,

    /// Jurisdiction bitmask is zero
    #[msg("Invalid jurisdiction bitmask: must be non-zero")]
    InvalidJurisdictionBitmask,
}
