use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::system_program::{self, CreateAccount};
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{transfer_hook, ExtensionType},
};
use anchor_spl::token_2022::Token2022;

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

    /// Token-2022 mint, created in the handler with extensions per preset.
    /// SSS-1: mint_authority + freeze_authority + metadata
    /// SSS-2: SSS-1 + transfer_hook + permanent_delegate
    /// The PermanentDelegate extension (mint_config) is only added when the
    /// preset enables it (SSS-2, or Custom with enable_permanent_delegate).
    #[account(mut)]
    pub mint: Signer<'info>,

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

    create_mint(&ctx, perm_delegate)?;

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

/// Create the Token-2022 mint: TransferHook (authority mint_config), plus
/// PermanentDelegate (mint_config) only when `perm_delegate`, then
/// initialize it with mint_config as mint and freeze authority.
fn create_mint(ctx: &Context<Initialize>, perm_delegate: bool) -> Result<()> {
    let token_program = ctx.accounts.token_program.key();
    let mint = ctx.accounts.mint.key();
    let mint_config = ctx.accounts.mint_config.key();

    let mut extensions = vec![ExtensionType::TransferHook];
    if perm_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    let space =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)?;
    system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        Rent::get()?.minimum_balance(space),
        space as u64,
        &token_program,
    )?;

    let mint_infos = [
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ];
    invoke(
        &transfer_hook::instruction::initialize(
            &token_program,
            &mint,
            Some(mint_config),
            Some(ctx.accounts.transfer_hook_program.key()),
        )?,
        &mint_infos,
    )?;
    if perm_delegate {
        invoke(
            &spl_token_2022::instruction::initialize_permanent_delegate(
                &token_program,
                &mint,
                &mint_config,
            )?,
            &mint_infos,
        )?;
    }
    invoke(
        &spl_token_2022::instruction::initialize_mint2(
            &token_program,
            &mint,
            &mint_config,
            Some(&mint_config),
            2, // Stablecoin uses 2 decimal places
        )?,
        &mint_infos,
    )?;
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
