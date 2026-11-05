use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ShieldError;
use crate::state::{ShieldConfig, SwapReceipt, SwapStatus};
use crate::token_transfer::transfer_checked_with_hook;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

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

    /// Output token mint (Token2022), must be the receipt's output mint
    #[account(address = swap_receipt.output_mint)]
    pub output_mint: InterfaceAccount<'info, Mint>,

    /// This receipt's escrow output token account
    #[account(
        mut,
        seeds = [SwapReceipt::ESCROW_OUTPUT_SEED, swap_receipt.key().as_ref()],
        bump,
        token::mint = output_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_output_token: InterfaceAccount<'info, TokenAccount>,

    /// Trader's output token account
    #[account(
        mut,
        token::mint = output_mint,
        token::authority = trader,
    )]
    pub trader_output_token: InterfaceAccount<'info, TokenAccount>,

    /// Fee recipient's token account
    #[account(
        mut,
        token::mint = output_mint,
        constraint = fee_recipient_token.owner == shield_config.fee_recipient,
    )]
    pub fee_recipient_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            SwapReceipt::SEED_PREFIX,
            swap_receipt.trader.as_ref(),
            &swap_receipt.nonce.to_le_bytes(),
        ],
        bump = swap_receipt.bump,
        constraint = swap_receipt.status == SwapStatus::Completed @ ShieldError::SwapNotCompleted,
        constraint = swap_receipt.trader == trader.key() @ ShieldError::Unauthorized,
    )]
    pub swap_receipt: Account<'info, SwapReceipt>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>) -> Result<()> {
    let receipt = &mut ctx.accounts.swap_receipt;
    let output_amount = receipt.output_amount;
    let fee_amount = receipt.fee_amount;
    let nonce = receipt.nonce;

    let authority_seeds: &[&[u8]] = &[
        ShieldConfig::ESCROW_AUTHORITY_SEED,
        &[ctx.accounts.shield_config.escrow_authority_bump],
    ];
    let signer_seeds = &[authority_seeds];

    // Transfer output tokens from escrow to trader via Token2022 transfer_checked
    transfer_checked_with_hook(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.escrow_output_token.to_account_info(),
        &ctx.accounts.output_mint.to_account_info(),
        &ctx.accounts.trader_output_token.to_account_info(),
        &ctx.accounts.escrow_authority.to_account_info(),
        ctx.remaining_accounts,
        output_amount,
        ctx.accounts.output_mint.decimals,
        signer_seeds,
    )?;

    // Transfer fee to fee recipient
    if fee_amount > 0 {
        transfer_checked_with_hook(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.escrow_output_token.to_account_info(),
            &ctx.accounts.output_mint.to_account_info(),
            &ctx.accounts.fee_recipient_token.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            ctx.remaining_accounts,
            fee_amount,
            ctx.accounts.output_mint.decimals,
            signer_seeds,
        )?;
    }

    // Mark receipt as withdrawn so it cannot be withdrawn again
    receipt.status = SwapStatus::Withdrawn;

    emit!(TokensWithdrawn {
        trader: ctx.accounts.trader.key(),
        mint: ctx.accounts.output_mint.key(),
        amount: output_amount,
        nonce,
    });

    Ok(())
}

#[event]
pub struct TokensWithdrawn {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}
