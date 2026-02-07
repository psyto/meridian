use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, TransferChecked, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::MeridianError;

/// Transfer JPY with compliance check via transfer hook
/// No 100万円 limit for trust-type electronic payment method (信託型3号電子決済手段)
#[derive(Accounts)]
pub struct TransferJpy<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = !mint_config.is_paused @ MeridianError::MintPaused
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        constraint = mint.key() == mint_config.mint @ MeridianError::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Transfer hook program validates KYC/AML compliance
    pub transfer_hook_program: UncheckedAccount<'info>,

    /// CHECK: Extra account metas for transfer hook
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransferParams {
    pub amount: u64,
    /// Optional memo for the transfer
    pub memo: Option<[u8; 32]>,
}

pub fn handler(ctx: Context<TransferJpy>, params: TransferParams) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        ctx.accounts.sender_token_account.amount >= params.amount,
        MeridianError::InsufficientBalance
    );

    // Transfer with transfer hook enforcement
    // The transfer hook program will validate:
    // 1. Sender KYC status
    // 2. Recipient KYC status
    // 3. Transaction limits (if any)
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.sender_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.sender.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );

    // Decimals = 2 for JPY (¥100.00)
    token_2022::transfer_checked(cpi_ctx, params.amount, 2)?;

    emit!(JpyTransferred {
        mint: ctx.accounts.mint.key(),
        sender: ctx.accounts.sender.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount: params.amount,
        memo: params.memo,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct JpyTransferred {
    pub mint: Pubkey,
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub memo: Option<[u8; 32]>,
    pub timestamp: i64,
}
