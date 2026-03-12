//! ZK Verifier Program
//!
//! On-chain verifier for Noir ZK compliance proofs. Stores verification keys
//! and creates attestations for wallets that prove KYC/AML compliance
//! without revealing private data.
//!
//! Key Features:
//! - Verification key management for Noir circuits
//! - ZK proof verification and attestation creation
//! - Attestation lifecycle (create, check, revoke)
//! - Kill switch for emergency deactivation

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("ZKVRFYxR3Ge8mTnUXzKnFHB1aLNhWMdP5DUNbvX91Kt");

#[program]
pub mod zk_verifier {
    use super::*;

    /// Initialize the verifier config with circuit ID and verification key
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Update the verification key (circuit upgrade)
    pub fn update_verification_key(
        ctx: Context<UpdateVerificationKey>,
        params: UpdateVerificationKeyParams,
    ) -> Result<()> {
        instructions::update_verification_key::handler(ctx, params)
    }

    /// Verify a ZK compliance proof and create/update an attestation
    pub fn verify_proof(ctx: Context<VerifyProof>, params: VerifyProofParams) -> Result<()> {
        instructions::verify_proof::handler(ctx, params)
    }

    /// Check if a wallet has a valid attestation
    pub fn check_attestation(ctx: Context<CheckAttestation>) -> Result<()> {
        instructions::check_attestation::handler(ctx)
    }

    /// Revoke a wallet's attestation (authority only)
    pub fn revoke_attestation(ctx: Context<RevokeAttestation>) -> Result<()> {
        instructions::revoke_attestation::handler(ctx)
    }

    /// Deactivate the verifier (kill switch)
    pub fn deactivate(ctx: Context<ToggleActive>) -> Result<()> {
        instructions::toggle_active::deactivate_handler(ctx)
    }

    /// Reactivate the verifier
    pub fn activate(ctx: Context<ToggleActive>) -> Result<()> {
        instructions::toggle_active::activate_handler(ctx)
    }
}
