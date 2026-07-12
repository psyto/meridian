use anchor_lang::prelude::*;

use crate::errors::ShieldError;
use crate::state::ShieldConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ShieldConfig::INIT_SPACE,
        seeds = [ShieldConfig::SEED_PREFIX],
        bump,
    )]
    pub shield_config: Account<'info, ShieldConfig>,

    /// CHECK: PDA authority for escrow token accounts
    #[account(
        seeds = [ShieldConfig::ESCROW_AUTHORITY_SEED],
        bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    transfer_hook_program: Pubkey,
    kyc_registry: Pubkey,
    fee_bps: u16,
    fee_recipient: Pubkey,
    attestor_pubkey: Pubkey,
) -> Result<()> {
    require!(fee_bps <= ShieldConfig::MAX_FEE_BPS, ShieldError::FeeTooHigh);
    require!(attestor_pubkey != Pubkey::default(), ShieldError::InvalidAttestor);

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.shield_config;

    config.authority = ctx.accounts.authority.key();
    config.escrow_authority = ctx.accounts.escrow_authority.key();
    config.transfer_hook_program = transfer_hook_program;
    config.kyc_registry = kyc_registry;
    config.attestor_pubkey = attestor_pubkey;
    config.total_swaps = 0;
    config.total_volume = 0;
    config.fee_bps = fee_bps;
    config.fee_recipient = fee_recipient;
    config.is_active = true;
    config.created_at = clock.unix_timestamp;
    config.bump = ctx.bumps.shield_config;
    config.escrow_authority_bump = ctx.bumps.escrow_authority;

    emit!(ShieldInitialized {
        authority: config.authority,
        transfer_hook_program,
        kyc_registry,
        attestor_pubkey,
    });

    Ok(())
}

#[event]
pub struct ShieldInitialized {
    pub authority: Pubkey,
    pub transfer_hook_program: Pubkey,
    pub kyc_registry: Pubkey,
    pub attestor_pubkey: Pubkey,
}
