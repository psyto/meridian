//! Meridian JPY Stablecoin Program
//!
//! A trust-type electronic payment method (信託型3号電子決済手段) compliant
//! JPY stablecoin built on Solana using Token-2022 with transfer hooks.
//!
//! Key Features:
//! - No 100万円 limit for domestic transfers (PSA compliant)
//! - 100% fiat-backed with auditable collateral
//! - KYC/AML enforcement via transfer hooks
//! - Multi-issuer support (Trust Bank, Distributors, Exchanges)
//!
//! Cross-bred from:
//! - continuum/jpy-stablecoin (Token-2022 patterns)
//! - lending (collateral management)
//! - titanus (ownership proofs, audit trails)

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("JPYm1111111111111111111111111111111111111111");

#[program]
pub mod meridian_jpy {
    use super::*;

    /// Initialize the JPY stablecoin mint with Token-2022 extensions
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint JPY tokens to a verified recipient
    pub fn mint(ctx: Context<MintJpy>, params: MintParams) -> Result<()> {
        instructions::mint::handler(ctx, params)
    }

    /// Burn JPY tokens for fiat redemption
    pub fn burn(ctx: Context<BurnJpy>, params: BurnParams) -> Result<()> {
        instructions::burn::handler(ctx, params)
    }

    /// Transfer JPY with compliance check via transfer hook
    pub fn transfer(ctx: Context<TransferJpy>, params: TransferParams) -> Result<()> {
        instructions::transfer::handler(ctx, params)
    }

    /// Pause minting/burning operations (emergency)
    pub fn pause(ctx: Context<PauseMint>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Resume minting/burning operations
    pub fn unpause(ctx: Context<PauseMint>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Register an authorized issuer (Trust Bank, Distributor, etc.)
    pub fn register_issuer(
        ctx: Context<RegisterIssuer>,
        params: RegisterIssuerParams,
    ) -> Result<()> {
        instructions::issuer::register_handler(ctx, params)
    }

    /// Update issuer configuration
    pub fn update_issuer(ctx: Context<UpdateIssuer>, params: UpdateIssuerParams) -> Result<()> {
        instructions::issuer::update_handler(ctx, params)
    }

    /// Initialize collateral vault
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: InitializeVaultParams,
    ) -> Result<()> {
        instructions::collateral::initialize_vault_handler(ctx, params)
    }

    /// Update collateral (deposit/withdrawal)
    pub fn update_collateral(
        ctx: Context<UpdateCollateral>,
        params: UpdateCollateralParams,
    ) -> Result<()> {
        instructions::collateral::update_collateral_handler(ctx, params)
    }

    /// Submit audit report
    pub fn submit_audit(ctx: Context<SubmitAudit>, params: SubmitAuditParams) -> Result<()> {
        instructions::collateral::submit_audit_handler(ctx, params)
    }
}
