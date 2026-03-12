//! Shield Escrow - Compliant Hybrid Liquidity Router
//!
//! On-chain component of the ComplianceShieldRouter protocol. Enables KYC'd
//! traders to access non-KYC liquidity pools through a whitelisted escrow PDA.
//!
//! Flow:
//! 1. Trader deposits tokens into escrow (compliance enforced via transfer hook)
//! 2. Keeper executes DEX swap through Jupiter-routed pools
//! 3. Trader withdraws output tokens from escrow (compliance enforced)
//!
//! The escrow PDA is KYC-whitelisted in the compliance registry, allowing it
//! to interact with any liquidity pool while maintaining the compliance chain
//! for the underlying trader.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("SHLDxR5GtSjk4FGebmqZBfLSuGhWMaWM46U9DjMkfWF");

#[program]
pub mod shield_escrow {
    use super::*;

    /// Initialize the Shield Escrow configuration and derive the escrow authority PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        transfer_hook_program: Pubkey,
        kyc_registry: Pubkey,
        fee_bps: u16,
        fee_recipient: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, transfer_hook_program, kyc_registry, fee_bps, fee_recipient)
    }

    /// Deposit input tokens into the escrow. Creates a SwapReceipt in Pending status.
    /// Uses Token2022 transfer_checked so the transfer hook enforces compliance.
    pub fn deposit(ctx: Context<Deposit>, nonce: u64, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, nonce, amount)
    }

    /// Execute the DEX swap. Called by the keeper/relayer after performing the
    /// off-chain Jupiter swap. Records output amount and deducts protocol fee.
    pub fn execute_swap(
        ctx: Context<ExecuteSwap>,
        output_amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        instructions::execute_swap::handler(ctx, output_amount, min_output_amount)
    }

    /// Withdraw output tokens from the escrow after swap completion.
    /// Uses Token2022 transfer_checked so the transfer hook enforces compliance.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    /// Refund input tokens if the swap fails. Only callable by the authority.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Update the escrow configuration (fee, recipient, active status).
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_bps: Option<u16>,
        fee_recipient: Option<Pubkey>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, fee_bps, fee_recipient, is_active)
    }
}
