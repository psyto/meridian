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

    /// Token-2022 mint with extensions configured based on preset.
    /// SSS-1: mint_authority + freeze_authority + metadata
    /// SSS-2: SSS-1 + transfer_hook + permanent_delegate
    #[account(
        init,
        payer = authority,
        mint::decimals = 2, // Stablecoin uses 2 decimal places
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
    /// SSS-1 (minimal) or SSS-2 (compliant) or Custom
    pub preset: StablecoinPreset,
    /// Token name (stored in on-chain metadata)
    pub name: String,
    /// Token symbol
    pub symbol: String,
    /// Metadata URI
    pub uri: String,
    /// Token decimals (default: 2 for fiat stablecoins)
    pub decimals: u8,
    /// Freeze authority override
    pub freeze_authority: Option<Pubkey>,
    /// Price oracle
    pub price_oracle: Option<Pubkey>,
    /// Treasury for seized tokens (required for SSS-2)
    pub treasury: Option<Pubkey>,
    // SSS-2 / Custom overrides:
    /// Enable permanent delegate (auto-enabled for SSS-2)
    pub enable_permanent_delegate: Option<bool>,
    /// Enable transfer hook (auto-enabled for SSS-2)
    pub enable_transfer_hook: Option<bool>,
    /// New accounts start frozen (auto-enabled for SSS-2)
    pub default_account_frozen: Option<bool>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;

    // Resolve preset defaults
    let (perm_delegate, hook_enabled, default_frozen) = match params.preset {
        StablecoinPreset::Sss1 => (false, false, false),
        StablecoinPreset::Sss2 => (true, true, true),
        StablecoinPreset::Custom => (
            params.enable_permanent_delegate.unwrap_or(false),
            params.enable_transfer_hook.unwrap_or(false),
            params.default_account_frozen.unwrap_or(false),
        ),
    };

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

    // SSS preset fields
    mint_config.preset = params.preset;
    mint_config.enable_permanent_delegate = perm_delegate;
    mint_config.enable_transfer_hook = hook_enabled;
    mint_config.default_account_frozen = default_frozen;
    mint_config.decimals = params.decimals;
    mint_config.treasury = params.treasury;

    emit!(MintInitialized {
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        transfer_hook_program: ctx.accounts.transfer_hook_program.key(),
        preset: params.preset,
        enable_permanent_delegate: perm_delegate,
        enable_transfer_hook: hook_enabled,
        default_account_frozen: default_frozen,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct MintInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub transfer_hook_program: Pubkey,
    pub preset: StablecoinPreset,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub timestamp: i64,
}
