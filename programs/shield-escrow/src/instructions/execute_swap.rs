use anchor_lang::prelude::*;

use crate::errors::ShieldError;
use crate::state::{ShieldConfig, SwapReceipt, SwapStatus};

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(
        constraint = authority.key() == shield_config.authority @ ShieldError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ShieldConfig::SEED_PREFIX],
        bump = shield_config.bump,
        constraint = shield_config.is_active @ ShieldError::ShieldNotActive,
    )]
    pub shield_config: Account<'info, ShieldConfig>,

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
}

pub fn handler(
    ctx: Context<ExecuteSwap>,
    output_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    require!(output_amount > 0, ShieldError::InvalidSwapAmount);
    require!(output_amount >= min_output_amount, ShieldError::InsufficientOutput);

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.shield_config;
    let receipt = &mut ctx.accounts.swap_receipt;

    // Calculate and deduct protocol fee
    let fee_amount = config.calculate_fee(output_amount);
    let net_output = output_amount.saturating_sub(fee_amount);

    // Update receipt
    receipt.output_amount = net_output;
    receipt.fee_amount = fee_amount;
    receipt.status = SwapStatus::Completed;
    receipt.completed_at = Some(clock.unix_timestamp);

    // Update global stats
    config.total_swaps = config.total_swaps.saturating_add(1);
    config.total_volume = config.total_volume.saturating_add(receipt.input_amount);

    emit!(SwapExecutedEvent {
        trader: receipt.trader,
        input_mint: receipt.input_mint,
        output_mint: receipt.output_mint,
        input_amount: receipt.input_amount,
        output_amount: net_output,
        fee_amount,
        nonce: receipt.nonce,
    });

    Ok(())
}

#[event]
pub struct SwapExecutedEvent {
    pub trader: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_amount: u64,
    pub output_amount: u64,
    pub fee_amount: u64,
    pub nonce: u64,
}
