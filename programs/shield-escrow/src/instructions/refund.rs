use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ShieldError;
use crate::state::{ShieldConfig, SwapReceipt, SwapStatus};
use crate::token_transfer::transfer_checked_with_hook;

#[derive(Accounts)]
pub struct Refund<'info> {
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

    /// Input token mint (Token2022), must be the receipt's input mint
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

    /// Trader's input token account (refund destination)
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = swap_receipt.trader,
    )]
    pub trader_input_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            SwapReceipt::SEED_PREFIX,
            swap_receipt.trader.as_ref(),
            &swap_receipt.nonce.to_le_bytes(),
        ],
        bump = swap_receipt.bump,
        constraint = swap_receipt.status == SwapStatus::Pending @ ShieldError::SwapNotPending,
    )]
    pub swap_receipt: Account<'info, SwapReceipt>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, Refund<'info>>) -> Result<()> {
    let receipt = &mut ctx.accounts.swap_receipt;
    let refund_amount = receipt.input_amount;
    let nonce = receipt.nonce;
    let trader = receipt.trader;
    let mint = receipt.input_mint;

    let authority_seeds: &[&[u8]] = &[
        ShieldConfig::ESCROW_AUTHORITY_SEED,
        &[ctx.accounts.shield_config.escrow_authority_bump],
    ];
    let signer_seeds = &[authority_seeds];

    // Transfer input tokens back from escrow to trader via Token2022 transfer_checked
    transfer_checked_with_hook(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.escrow_input_token.to_account_info(),
        &ctx.accounts.input_mint.to_account_info(),
        &ctx.accounts.trader_input_token.to_account_info(),
        &ctx.accounts.escrow_authority.to_account_info(),
        ctx.remaining_accounts,
        refund_amount,
        ctx.accounts.input_mint.decimals,
        signer_seeds,
    )?;

    // Mark receipt as refunded
    let clock = Clock::get()?;
    receipt.status = SwapStatus::Refunded;
    receipt.completed_at = Some(clock.unix_timestamp);

    emit!(SwapRefunded {
        trader,
        mint,
        amount: refund_amount,
        nonce,
    });

    Ok(())
}

#[event]
pub struct SwapRefunded {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}
