use anchor_lang::prelude::*;

use crate::errors::ZkVerifierError;
use crate::state::*;

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [VerifierConfig::SEED_PREFIX],
        bump = verifier_config.bump,
        constraint = verifier_config.is_active @ ZkVerifierError::VerifierNotActive,
    )]
    pub verifier_config: Account<'info, VerifierConfig>,

    #[account(
        init_if_needed,
        payer = wallet,
        space = 8 + ComplianceAttestation::INIT_SPACE,
        seeds = [ComplianceAttestation::SEED_PREFIX, wallet.key().as_ref()],
        bump
    )]
    pub attestation: Account<'info, ComplianceAttestation>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VerifyProofParams {
    /// ZK proof bytes
    pub proof: [u8; 64],
    /// Pedersen commitment from the proof
    pub commitment: [u8; 32],
    /// KYC level that was proven (0-4)
    pub required_kyc_level: u8,
    /// Jurisdiction bitmask that was proven
    pub jurisdiction_bitmask: u32,
    /// When this proof's constraints expire
    pub expiry_timestamp: i64,
}

pub fn handler(ctx: Context<VerifyProof>, params: VerifyProofParams) -> Result<()> {
    let clock = Clock::get()?;

    // Validate KYC level range
    require!(params.required_kyc_level <= 4, ZkVerifierError::InvalidKycLevel);

    // Validate jurisdiction bitmask is non-zero
    require!(params.jurisdiction_bitmask != 0, ZkVerifierError::InvalidJurisdictionBitmask);

    // Validate expiry is in the future
    require!(
        params.expiry_timestamp > clock.unix_timestamp,
        ZkVerifierError::ProofExpired
    );

    // In production: verify the actual Noir proof against the verification key.
    // Current implementation validates input consistency and creates attestation.
    //
    // TODO: Integrate Noir verifier library when available for Solana BPF.
    // The proof bytes, commitment, and verification key would be passed to
    // the verifier to confirm the ZK proof is valid.
    let proof_valid = verify_proof_inputs(
        &params.proof,
        &params.commitment,
        &ctx.accounts.verifier_config.verification_key,
    );

    let verifier_config = &mut ctx.accounts.verifier_config;

    if !proof_valid {
        verifier_config.total_rejections = verifier_config
            .total_rejections
            .checked_add(1)
            .unwrap_or(u64::MAX);
        return Err(ZkVerifierError::ProofInvalid.into());
    }

    verifier_config.total_verifications = verifier_config
        .total_verifications
        .checked_add(1)
        .unwrap_or(u64::MAX);
    verifier_config.updated_at = clock.unix_timestamp;

    // Create or update the attestation
    let attestation = &mut ctx.accounts.attestation;
    attestation.wallet = ctx.accounts.wallet.key();
    attestation.verifier_config = verifier_config.key();
    attestation.commitment = params.commitment;
    attestation.required_kyc_level = params.required_kyc_level;
    attestation.jurisdiction_bitmask = params.jurisdiction_bitmask;
    attestation.verified_at = clock.unix_timestamp;
    attestation.expires_at = params.expiry_timestamp;
    attestation.is_valid = true;
    attestation.bump = ctx.bumps.attestation;

    emit!(ProofVerified {
        wallet: ctx.accounts.wallet.key(),
        commitment: params.commitment,
        required_kyc_level: params.required_kyc_level,
        jurisdiction_bitmask: params.jurisdiction_bitmask,
        expires_at: params.expiry_timestamp,
    });

    Ok(())
}

/// Validate proof input consistency.
/// In production this would call the actual Noir verifier.
/// Current implementation checks that proof and commitment are non-zero.
fn verify_proof_inputs(
    proof: &[u8; 64],
    commitment: &[u8; 32],
    _verification_key: &[u8; 128],
) -> bool {
    // Ensure proof bytes are not all zeros (placeholder validation)
    let proof_non_zero = proof.iter().any(|&b| b != 0);
    // Ensure commitment is not all zeros
    let commitment_non_zero = commitment.iter().any(|&b| b != 0);

    proof_non_zero && commitment_non_zero
}

#[event]
pub struct ProofVerified {
    pub wallet: Pubkey,
    pub commitment: [u8; 32],
    pub required_kyc_level: u8,
    pub jurisdiction_bitmask: u32,
    pub expires_at: i64,
}
