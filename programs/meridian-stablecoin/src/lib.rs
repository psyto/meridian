//! Meridian Stablecoin Program
//!
//! A compliant electronic payment method stablecoin built on Solana
//! using Token-2022 with transfer hooks.
//!
//! Key Features:
//! - 100% fiat-backed with auditable collateral
//! - KYC/AML enforcement via transfer hooks
//! - Multi-issuer support (Trust Bank, Distributors, Exchanges)
//!
//! Built with patterns from:
//! - Token-2022 extensions
//! - Collateral management
//! - Ownership proofs and audit trails

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("HdaUf9PL9ncd1AgXbA13P9ss6mLtCVdGZfroZB4q6CwP");

#[program]
pub mod meridian_stablecoin {
    use super::*;

    /// Initialize the stablecoin mint with Token-2022 extensions
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint stablecoin tokens to a verified recipient
    pub fn mint(ctx: Context<MintStablecoin>, params: MintParams) -> Result<()> {
        instructions::mint::handler(ctx, params)
    }

    /// Burn stablecoin tokens for fiat redemption
    pub fn burn(ctx: Context<BurnStablecoin>, params: BurnParams) -> Result<()> {
        instructions::burn::handler(ctx, params)
    }

    /// Transfer stablecoin with compliance check via transfer hook
    pub fn transfer(ctx: Context<TransferStablecoin>, params: TransferParams) -> Result<()> {
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

    // =========================================================================
    // SSS-2 Compliance Instructions
    // =========================================================================

    /// Seize tokens from a frozen account via permanent delegate (SSS-2 only)
    /// Fails gracefully if permanent delegate was not enabled during initialization.
    pub fn seize(ctx: Context<Seize>, params: SeizeParams) -> Result<()> {
        instructions::seize::seize_handler(ctx, params)
    }

    // =========================================================================
    // Role Management
    // =========================================================================

    /// Initialize role-based access control
    pub fn initialize_roles(ctx: Context<InitializeRoles>) -> Result<()> {
        instructions::roles::initialize_roles_handler(ctx)
    }

    /// Update roles (master authority only)
    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, params)
    }
}
