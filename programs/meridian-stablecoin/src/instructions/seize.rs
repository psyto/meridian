use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, TransferChecked, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::MeridianError;
use crate::state::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    /// Authority performing the seize (must be master authority or seizer role)
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = mint_config.enable_permanent_delegate @ MeridianError::PermanentDelegateNotEnabled,
        constraint = mint_config.treasury.is_some() @ MeridianError::TreasuryNotConfigured,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        constraint = mint.key() == mint_config.mint @ MeridianError::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The frozen account to seize tokens from
    #[account(
        mut,
        token::mint = mint,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,

    /// Treasury account to receive seized tokens
    #[account(
        mut,
        token::mint = mint,
        constraint = treasury.key() == mint_config.treasury.unwrap() @ MeridianError::TreasuryNotConfigured,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SeizeParams {
    /// Amount to seize (0 = seize entire balance)
    pub amount: u64,
    /// Reason for seizure (audit trail)
    pub reason: [u8; 32],
}

pub fn seize_handler(ctx: Context<Seize>, params: SeizeParams) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &ctx.accounts.mint_config;

    // Verify caller is authorized (master authority check)
    require!(
        ctx.accounts.authority.key() == mint_config.authority,
        MeridianError::Unauthorized
    );

    // Determine seize amount
    let seize_amount = if params.amount == 0 {
        ctx.accounts.source.amount
    } else {
        params.amount
    };

    require!(seize_amount > 0, MeridianError::InvalidAmount);

    // Transfer using permanent delegate authority (mint_config PDA)
    let seeds = &[
        MintConfig::SEED_PREFIX,
        &[mint_config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.source.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.treasury.to_account_info(),
        authority: ctx.accounts.mint_config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_2022::transfer_checked(cpi_ctx, seize_amount, mint_config.decimals)?;

    emit!(TokensSeized {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.source.key(),
        to: ctx.accounts.treasury.key(),
        amount: seize_amount,
        reason: params.reason,
        seized_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub reason: [u8; 32],
    pub seized_by: Pubkey,
    pub timestamp: i64,
}
