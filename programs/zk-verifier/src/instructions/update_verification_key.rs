use anchor_lang::prelude::*;

use crate::errors::ZkVerifierError;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateVerificationKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VerifierConfig::SEED_PREFIX],
        bump = verifier_config.bump,
        constraint = verifier_config.authority == authority.key() @ ZkVerifierError::Unauthorized,
    )]
    pub verifier_config: Account<'info, VerifierConfig>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateVerificationKeyParams {
    /// New circuit ID (SHA-256 of updated circuit bytecode)
    pub circuit_id: [u8; 32],
    /// New verification key bytes
    pub verification_key: [u8; 128],
}

pub fn handler(
    ctx: Context<UpdateVerificationKey>,
    params: UpdateVerificationKeyParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let verifier_config = &mut ctx.accounts.verifier_config;

    verifier_config.circuit_id = params.circuit_id;
    verifier_config.verification_key = params.verification_key;
    verifier_config.updated_at = clock.unix_timestamp;

    emit!(VerificationKeyUpdated {
        circuit_id: params.circuit_id,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct VerificationKeyUpdated {
    pub circuit_id: [u8; 32],
    pub timestamp: i64,
}
