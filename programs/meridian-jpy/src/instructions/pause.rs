use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::MeridianError;

#[derive(Accounts)]
pub struct PauseMint<'info> {
    #[account(
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,
}

pub fn pause_handler(ctx: Context<PauseMint>) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;

    require!(!mint_config.is_paused, MeridianError::AlreadyPaused);

    mint_config.is_paused = true;
    mint_config.updated_at = clock.unix_timestamp;

    emit!(MintPaused {
        mint: mint_config.mint,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseMint>) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;

    require!(mint_config.is_paused, MeridianError::NotPaused);

    mint_config.is_paused = false;
    mint_config.updated_at = clock.unix_timestamp;

    emit!(MintUnpaused {
        mint: mint_config.mint,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct MintPaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MintUnpaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}
