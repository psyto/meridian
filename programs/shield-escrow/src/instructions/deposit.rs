use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ShieldError;
use crate::state::{ShieldConfig, SwapReceipt, SwapStatus};

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        seeds = [ShieldConfig::SEED_PREFIX],
        bump = shield_config.bump,
        constraint = shield_config.is_active @ ShieldError::ShieldNotActive,
    )]
    pub shield_config: Account<'info, ShieldConfig>,

    /// CHECK: Escrow authority PDA
    #[account(
        seeds = [ShieldConfig::ESCROW_AUTHORITY_SEED],
        bump = shield_config.escrow_authority_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    /// Input token mint (Token2022)
    pub input_mint: InterfaceAccount<'info, Mint>,

    /// Output token mint (for receipt tracking)
    pub output_mint: InterfaceAccount<'info, Mint>,

    /// Trader's input token account
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = trader,
    )]
    pub trader_input_token: InterfaceAccount<'info, TokenAccount>,

    /// Escrow's input token account
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_input_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = trader,
        space = 8 + SwapReceipt::INIT_SPACE,
        seeds = [SwapReceipt::SEED_PREFIX, trader.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub swap_receipt: Account<'info, SwapReceipt>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, nonce: u64, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Transfer tokens from trader to escrow via Token2022 transfer_checked
    // The transfer hook enforces compliance (KYC check) automatically
    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::TransferChecked {
                from: ctx.accounts.trader_input_token.to_account_info(),
                mint: ctx.accounts.input_mint.to_account_info(),
                to: ctx.accounts.escrow_input_token.to_account_info(),
                authority: ctx.accounts.trader.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.input_mint.decimals,
    )?;

    // Initialize the swap receipt
    let receipt = &mut ctx.accounts.swap_receipt;
    receipt.trader = ctx.accounts.trader.key();
    receipt.input_mint = ctx.accounts.input_mint.key();
    receipt.output_mint = ctx.accounts.output_mint.key();
    receipt.input_amount = amount;
    receipt.output_amount = 0;
    receipt.fee_amount = 0;
    receipt.status = SwapStatus::Pending;
    receipt.nonce = nonce;
    receipt.created_at = clock.unix_timestamp;
    receipt.completed_at = None;
    receipt.bump = ctx.bumps.swap_receipt;

    emit!(TokensDeposited {
        trader: receipt.trader,
        mint: receipt.input_mint,
        amount,
        nonce,
    });

    Ok(())
}

#[event]
pub struct TokensDeposited {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}
