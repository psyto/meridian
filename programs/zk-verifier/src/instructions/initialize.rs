use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + VerifierConfig::INIT_SPACE,
        seeds = [VerifierConfig::SEED_PREFIX],
        bump
    )]
    pub verifier_config: Account<'info, VerifierConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    /// SHA-256 hash of the circuit bytecode
    pub circuit_id: [u8; 32],
    /// Truncated verification key bytes
    pub verification_key: [u8; 128],
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let clock = Clock::get()?;
    let verifier_config = &mut ctx.accounts.verifier_config;

    verifier_config.authority = ctx.accounts.authority.key();
    verifier_config.circuit_id = params.circuit_id;
    verifier_config.verification_key = params.verification_key;
    verifier_config.total_verifications = 0;
    verifier_config.total_rejections = 0;
    verifier_config.is_active = true;
    verifier_config.created_at = clock.unix_timestamp;
    verifier_config.updated_at = clock.unix_timestamp;
    verifier_config.bump = ctx.bumps.verifier_config;

    emit!(VerifierInitialized {
        authority: ctx.accounts.authority.key(),
        circuit_id: params.circuit_id,
    });

    Ok(())
}

#[event]
pub struct VerifierInitialized {
    pub authority: Pubkey,
    pub circuit_id: [u8; 32],
}
