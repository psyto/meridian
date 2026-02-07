use anchor_lang::prelude::*;

/// Error codes for Meridian JPY Stablecoin
/// Meridian 日本円ステーブルコインのエラーコード
#[error_code]
pub enum MeridianError {
    /// Unauthorized: caller is not the authority
    /// 権限エラー: 呼び出し元に権限がありません
    #[msg("Unauthorized: caller is not the authority / 権限エラー: 呼び出し元に権限がありません")]
    Unauthorized,

    /// Mint is currently paused
    /// 発行が一時停止されています
    #[msg("Mint is currently paused / 発行が一時停止されています")]
    MintPaused,

    /// Mint is already paused
    /// 発行は既に停止されています
    #[msg("Mint is already paused / 発行は既に停止されています")]
    AlreadyPaused,

    /// Mint is not paused
    /// 発行は停止されていません
    #[msg("Mint is not paused / 発行は停止されていません")]
    NotPaused,

    /// Invalid mint address
    /// 無効なミントアドレス
    #[msg("Invalid mint address / 無効なミントアドレス")]
    InvalidMint,

    /// Issuer is inactive
    /// 発行者が無効です
    #[msg("Issuer is inactive / 発行者が無効です")]
    IssuerInactive,

    /// Invalid issuer
    /// 無効な発行者
    #[msg("Invalid issuer / 無効な発行者")]
    InvalidIssuer,

    /// Insufficient collateral to mint
    /// 発行に必要な担保が不足しています
    #[msg("Insufficient collateral to mint / 発行に必要な担保が不足しています")]
    InsufficientCollateral,

    /// Daily limit exceeded
    /// 日次制限を超過しています
    #[msg("Daily limit exceeded / 日次制限を超過しています")]
    DailyLimitExceeded,

    /// Insufficient supply to burn
    /// 焼却に必要な供給量が不足しています
    #[msg("Insufficient supply to burn / 焼却に必要な供給量が不足しています")]
    InsufficientSupply,

    /// Insufficient balance
    /// 残高が不足しています
    #[msg("Insufficient balance / 残高が不足しています")]
    InsufficientBalance,

    /// Vault is inactive
    /// ボールトが無効です
    #[msg("Vault is inactive / ボールトが無効です")]
    VaultInactive,

    /// Collateral ratio violation: must maintain 100% backing
    /// 担保率違反: 100%の担保が必要です
    #[msg("Collateral ratio violation: must maintain 100% backing / 担保率違反: 100%の担保が必要です")]
    CollateralRatioViolation,

    /// Math overflow
    /// 数値オーバーフロー
    #[msg("Math overflow / 数値オーバーフロー")]
    MathOverflow,

    /// Invalid amount: must be greater than zero
    /// 無効な金額: 0より大きい値が必要です
    #[msg("Invalid amount: must be greater than zero / 無効な金額: 0より大きい値が必要です")]
    InvalidAmount,

    /// KYC verification required
    /// KYC認証が必要です
    #[msg("KYC verification required / KYC認証が必要です")]
    KycRequired,

    /// KYC verification expired
    /// KYC認証の有効期限が切れています
    #[msg("KYC verification expired / KYC認証の有効期限が切れています")]
    KycExpired,

    /// Transfer not allowed: compliance check failed
    /// 送金不可: コンプライアンスチェック失敗
    #[msg("Transfer not allowed: compliance check failed / 送金不可: コンプライアンスチェック失敗")]
    ComplianceCheckFailed,

    /// Jurisdiction not supported
    /// サポートされていない管轄地域
    #[msg("Jurisdiction not supported / サポートされていない管轄地域")]
    UnsupportedJurisdiction,
}
