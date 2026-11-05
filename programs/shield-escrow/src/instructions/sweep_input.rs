use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ShieldError;
use crate::state::{ShieldConfig, SwapReceipt, SwapStatus};
use crate::token_transfer::transfer_checked_with_hook;

/// After the trader has withdrawn the swap output, the input tokens left in
/// the receipt's escrow input account go to the authority (the keeper that
/// delivered the output). Completed alone is not enough: execute_swap does
/// not check that the output was actually delivered, and refund needs Pending.
#[derive(Accounts)]
pub struct SweepInput<'info> {
    #[account(
        constraint = authority.key() == shield_config.authority @ ShieldError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [ShieldConfig::SEED_PREFIX],
        bump = shield_config.bump,
    )]
    pub shield_config: Account<'info, ShieldConfig>,

    /// CHECK: Escrow authority PDA, signs token transfers out of escrow
    #[account(
        seeds = [ShieldConfig::ESCROW_AUTHORITY_SEED],
        bump = shield_config.escrow_authority_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    /// Input token mint, must be the receipt's input mint
    #[account(address = swap_receipt.input_mint)]
    pub input_mint: InterfaceAccount<'info, Mint>,

    /// This receipt's escrow input token account
    #[account(
        mut,
        seeds = [SwapReceipt::ESCROW_INPUT_SEED, swap_receipt.key().as_ref()],
        bump,
        token::mint = input_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_input_token: InterfaceAccount<'info, TokenAccount>,

    /// Authority's input token account (destination)
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = authority,
    )]
    pub authority_input_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [
            SwapReceipt::SEED_PREFIX,
            swap_receipt.trader.as_ref(),
            &swap_receipt.nonce.to_le_bytes(),
        ],
        bump = swap_receipt.bump,
        constraint = swap_receipt.status == SwapStatus::Withdrawn @ ShieldError::SwapNotWithdrawn,
    )]
    pub swap_receipt: Account<'info, SwapReceipt>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, SweepInput<'info>>) -> Result<()> {
    let amount = ctx.accounts.escrow_input_token.amount;
    require!(amount > 0, ShieldError::NothingToSweep);

    let authority_seeds: &[&[u8]] = &[
        ShieldConfig::ESCROW_AUTHORITY_SEED,
        &[ctx.accounts.shield_config.escrow_authority_bump],
    ];

    transfer_checked_with_hook(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.escrow_input_token.to_account_info(),
        &ctx.accounts.input_mint.to_account_info(),
        &ctx.accounts.authority_input_token.to_account_info(),
        &ctx.accounts.escrow_authority.to_account_info(),
        ctx.remaining_accounts,
        amount,
        ctx.accounts.input_mint.decimals,
        &[authority_seeds],
    )?;

    emit!(InputSwept {
        trader: ctx.accounts.swap_receipt.trader,
        mint: ctx.accounts.input_mint.key(),
        amount,
        nonce: ctx.accounts.swap_receipt.nonce,
        recipient: ctx.accounts.authority_input_token.key(),
    });

    Ok(())
}

#[event]
pub struct InputSwept {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub recipient: Pubkey,
}
