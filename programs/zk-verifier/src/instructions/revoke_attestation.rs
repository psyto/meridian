use anchor_lang::prelude::*;

use crate::errors::ZkVerifierError;
use crate::state::*;

#[derive(Accounts)]
pub struct RevokeAttestation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VerifierConfig::SEED_PREFIX],
        bump = verifier_config.bump,
        constraint = verifier_config.authority == authority.key() @ ZkVerifierError::Unauthorized,
    )]
    pub verifier_config: Account<'info, VerifierConfig>,

    /// The wallet whose attestation is being revoked
    /// CHECK: This is just a pubkey reference for the PDA seed, not a signer
    pub wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ComplianceAttestation::SEED_PREFIX, wallet.key().as_ref()],
        bump = attestation.bump,
    )]
    pub attestation: Account<'info, ComplianceAttestation>,
}

pub fn handler(ctx: Context<RevokeAttestation>) -> Result<()> {
    let clock = Clock::get()?;
    let attestation = &mut ctx.accounts.attestation;

    attestation.is_valid = false;

    emit!(AttestationRevoked {
        wallet: ctx.accounts.wallet.key(),
        revoked_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct AttestationRevoked {
    pub wallet: Pubkey,
    pub revoked_by: Pubkey,
    pub timestamp: i64,
}
