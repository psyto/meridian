use anchor_lang::prelude::*;

use crate::errors::ZkVerifierError;
use crate::state::*;

#[derive(Accounts)]
pub struct ToggleActive<'info> {
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

pub fn deactivate_handler(ctx: Context<ToggleActive>) -> Result<()> {
    let clock = Clock::get()?;
    let verifier_config = &mut ctx.accounts.verifier_config;

    verifier_config.is_active = false;
    verifier_config.updated_at = clock.unix_timestamp;

    emit!(VerifierStatusChanged {
        is_active: false,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

pub fn activate_handler(ctx: Context<ToggleActive>) -> Result<()> {
    let clock = Clock::get()?;
    let verifier_config = &mut ctx.accounts.verifier_config;

    verifier_config.is_active = true;
    verifier_config.updated_at = clock.unix_timestamp;

    emit!(VerifierStatusChanged {
        is_active: true,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct VerifierStatusChanged {
    pub is_active: bool,
    pub timestamp: i64,
}
