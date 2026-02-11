use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, MintTo, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::MeridianError;

#[derive(Accounts)]
pub struct MintStablecoin<'info> {
    #[account(mut)]
    pub issuer_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = !mint_config.is_paused @ MeridianError::MintPaused
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [Issuer::SEED_PREFIX, issuer_authority.key().as_ref()],
        bump = issuer.bump,
        constraint = issuer.is_active @ MeridianError::IssuerInactive,
        constraint = issuer.mint_config == mint_config.key() @ MeridianError::InvalidIssuer
    )]
    pub issuer: Account<'info, Issuer>,

    #[account(
        mut,
        constraint = mint.key() == mint_config.mint @ MeridianError::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Recipient token account (must be whitelisted via transfer hook)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MintParams {
    pub amount: u64,
    /// Bank transfer reference for audit trail
    pub reference: [u8; 32],
}

pub fn handler(ctx: Context<MintStablecoin>, params: MintParams) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;
    let issuer = &mut ctx.accounts.issuer;

    // Reset daily limits if needed
    issuer.maybe_reset_daily(clock.unix_timestamp);

    // Validate minting
    require!(
        mint_config.can_mint(params.amount),
        MeridianError::InsufficientCollateral
    );
    require!(
        issuer.can_mint(params.amount),
        MeridianError::DailyLimitExceeded
    );

    // Create signer seeds for mint_config PDA
    let seeds = &[
        MintConfig::SEED_PREFIX,
        &[mint_config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Mint tokens
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: mint_config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_2022::mint_to(cpi_ctx, params.amount)?;

    // Update state
    mint_config.total_supply = mint_config.total_supply.saturating_add(params.amount);
    mint_config.updated_at = clock.unix_timestamp;
    issuer.record_mint(params.amount);

    emit!(StablecoinMinted {
        mint: ctx.accounts.mint.key(),
        issuer: ctx.accounts.issuer_authority.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount: params.amount,
        reference: params.reference,
        total_supply: mint_config.total_supply,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct StablecoinMinted {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub reference: [u8; 32],
    pub total_supply: u64,
    pub timestamp: i64,
}
