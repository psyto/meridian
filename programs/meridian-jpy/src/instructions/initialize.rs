use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;

use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + MintConfig::INIT_SPACE,
        seeds = [MintConfig::SEED_PREFIX],
        bump
    )]
    pub mint_config: Account<'info, MintConfig>,

    /// Token-2022 mint with transfer hook extension
    #[account(
        init,
        payer = authority,
        mint::decimals = 2, // JPY uses 2 decimal places (¥100.00)
        mint::authority = mint_config,
        mint::freeze_authority = mint_config,
        extensions::transfer_hook::authority = mint_config,
        extensions::transfer_hook::program_id = transfer_hook_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Transfer hook program for KYC/AML compliance
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub freeze_authority: Option<Pubkey>,
    pub price_oracle: Option<Pubkey>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;

    mint_config.authority = ctx.accounts.authority.key();
    mint_config.mint = ctx.accounts.mint.key();
    mint_config.transfer_hook_program = ctx.accounts.transfer_hook_program.key();
    mint_config.total_supply = 0;
    mint_config.total_collateral = 0;
    mint_config.collateral_ratio_bps = 10000; // 100%
    mint_config.is_paused = false;
    mint_config.freeze_authority = params.freeze_authority;
    mint_config.price_oracle = params.price_oracle;
    mint_config.last_audit = clock.unix_timestamp;
    mint_config.created_at = clock.unix_timestamp;
    mint_config.updated_at = clock.unix_timestamp;
    mint_config.bump = ctx.bumps.mint_config;

    emit!(MintInitialized {
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        transfer_hook_program: ctx.accounts.transfer_hook_program.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct MintInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub transfer_hook_program: Pubkey,
    pub timestamp: i64,
}
