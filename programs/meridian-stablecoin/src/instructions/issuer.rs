use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::MeridianError;

#[derive(Accounts)]
#[instruction(issuer_authority: Pubkey)]
pub struct RegisterIssuer<'info> {
    #[account(
        mut,
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + Issuer::INIT_SPACE,
        seeds = [Issuer::SEED_PREFIX, issuer_authority.as_ref()],
        bump
    )]
    pub issuer: Account<'info, Issuer>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterIssuerParams {
    pub issuer_authority: Pubkey,
    pub issuer_type: IssuerType,
    pub daily_mint_limit: u64,
    pub daily_burn_limit: u64,
}

pub fn register_handler(ctx: Context<RegisterIssuer>, params: RegisterIssuerParams) -> Result<()> {
    let clock = Clock::get()?;
    let issuer = &mut ctx.accounts.issuer;

    issuer.authority = params.issuer_authority;
    issuer.mint_config = ctx.accounts.mint_config.key();
    issuer.issuer_type = params.issuer_type;
    issuer.daily_mint_limit = params.daily_mint_limit;
    issuer.daily_burn_limit = params.daily_burn_limit;
    issuer.daily_minted = 0;
    issuer.daily_burned = 0;
    issuer.last_daily_reset = clock.unix_timestamp;
    issuer.total_minted = 0;
    issuer.total_burned = 0;
    issuer.is_active = true;
    issuer.registered_at = clock.unix_timestamp;
    issuer.bump = ctx.bumps.issuer;

    emit!(IssuerRegistered {
        issuer: params.issuer_authority,
        issuer_type: params.issuer_type,
        daily_mint_limit: params.daily_mint_limit,
        daily_burn_limit: params.daily_burn_limit,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateIssuer<'info> {
    #[account(
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [Issuer::SEED_PREFIX, issuer.authority.as_ref()],
        bump = issuer.bump,
        constraint = issuer.mint_config == mint_config.key() @ MeridianError::InvalidIssuer
    )]
    pub issuer: Account<'info, Issuer>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateIssuerParams {
    pub daily_mint_limit: Option<u64>,
    pub daily_burn_limit: Option<u64>,
    pub is_active: Option<bool>,
}

pub fn update_handler(ctx: Context<UpdateIssuer>, params: UpdateIssuerParams) -> Result<()> {
    let clock = Clock::get()?;
    let issuer = &mut ctx.accounts.issuer;

    if let Some(limit) = params.daily_mint_limit {
        issuer.daily_mint_limit = limit;
    }
    if let Some(limit) = params.daily_burn_limit {
        issuer.daily_burn_limit = limit;
    }
    if let Some(active) = params.is_active {
        issuer.is_active = active;
    }

    emit!(IssuerUpdated {
        issuer: issuer.authority,
        daily_mint_limit: issuer.daily_mint_limit,
        daily_burn_limit: issuer.daily_burn_limit,
        is_active: issuer.is_active,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct IssuerRegistered {
    pub issuer: Pubkey,
    pub issuer_type: IssuerType,
    pub daily_mint_limit: u64,
    pub daily_burn_limit: u64,
    pub timestamp: i64,
}

#[event]
pub struct IssuerUpdated {
    pub issuer: Pubkey,
    pub daily_mint_limit: u64,
    pub daily_burn_limit: u64,
    pub is_active: bool,
    pub timestamp: i64,
}
