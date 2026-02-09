//! Meridian JPY Stablecoin Program
//! Meridian 日本円ステーブルコインプログラム
//!
//! A trust-type electronic payment method (信託型3号電子決済手段) compliant
//! JPY stablecoin built on Solana using Token-2022 with transfer hooks.
//!
//! 資金決済法に準拠した信託型3号電子決済手段として、
//! Token-2022とトランスファーフックを使用してSolana上に構築された日本円ステーブルコイン。
//!
//! Key Features / 主要機能:
//! - No 100万円 limit for domestic transfers (PSA compliant)
//!   国内送金に100万円制限なし（資金決済法準拠）
//! - 100% fiat-backed with auditable collateral
//!   監査可能な担保による100%法定通貨裏付け
//! - KYC/AML enforcement via transfer hooks
//!   トランスファーフックによるKYC/AML強制
//! - Multi-issuer support (Trust Bank, Distributors, Exchanges)
//!   マルチ発行者対応（信託銀行、ディストリビューター、取引所）
//!
//! Built with patterns from:
//! - Token-2022 extensions
//! - Collateral management
//! - Ownership proofs and audit trails / 所有権証明、監査証跡

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
    /// Token-2022拡張機能を使用してJPYステーブルコインのミントを初期化
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint JPY tokens to a verified recipient
    /// 認証済み受取人にJPYトークンを発行
    pub fn mint(ctx: Context<MintJpy>, params: MintParams) -> Result<()> {
        instructions::mint::handler(ctx, params)
    }

    /// Burn JPY tokens for fiat redemption
    /// 法定通貨償還のためにJPYトークンを焼却
    pub fn burn(ctx: Context<BurnJpy>, params: BurnParams) -> Result<()> {
        instructions::burn::handler(ctx, params)
    }

    /// Transfer JPY with compliance check via transfer hook
    /// トランスファーフックによるコンプライアンスチェック付きでJPYを送金
    pub fn transfer(ctx: Context<TransferJpy>, params: TransferParams) -> Result<()> {
        instructions::transfer::handler(ctx, params)
    }

    /// Pause minting/burning operations (emergency)
    /// 発行/焼却操作を一時停止（緊急時）
    pub fn pause(ctx: Context<PauseMint>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Resume minting/burning operations
    /// 発行/焼却操作を再開
    pub fn unpause(ctx: Context<PauseMint>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Register an authorized issuer (Trust Bank, Distributor, etc.)
    /// 認可発行者を登録（信託銀行、ディストリビューター等）
    pub fn register_issuer(
        ctx: Context<RegisterIssuer>,
        params: RegisterIssuerParams,
    ) -> Result<()> {
        instructions::issuer::register_handler(ctx, params)
    }

    /// Update issuer configuration
    /// 発行者設定を更新
    pub fn update_issuer(ctx: Context<UpdateIssuer>, params: UpdateIssuerParams) -> Result<()> {
        instructions::issuer::update_handler(ctx, params)
    }

    /// Initialize collateral vault
    /// 担保ボールトを初期化
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: InitializeVaultParams,
    ) -> Result<()> {
        instructions::collateral::initialize_vault_handler(ctx, params)
    }

    /// Update collateral (deposit/withdrawal)
    /// 担保を更新（預入/引出）
    pub fn update_collateral(
        ctx: Context<UpdateCollateral>,
        params: UpdateCollateralParams,
    ) -> Result<()> {
        instructions::collateral::update_collateral_handler(ctx, params)
    }

    /// Submit audit report
    /// 監査レポートを提出
    pub fn submit_audit(ctx: Context<SubmitAudit>, params: SubmitAuditParams) -> Result<()> {
        instructions::collateral::submit_audit_handler(ctx, params)
    }
}
