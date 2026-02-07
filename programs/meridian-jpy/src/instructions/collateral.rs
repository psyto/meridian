use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::MeridianError;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        mut,
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + CollateralVault::INIT_SPACE,
        seeds = [CollateralVault::SEED_PREFIX, mint_config.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, CollateralVault>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeVaultParams {
    pub collateral_type: CollateralType,
    pub auditor: Option<Pubkey>,
}

pub fn initialize_vault_handler(
    ctx: Context<InitializeVault>,
    params: InitializeVaultParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.collateral_vault;

    vault.mint_config = ctx.accounts.mint_config.key();
    vault.total_collateral = 0;
    vault.authority = ctx.accounts.authority.key();
    vault.auditor = params.auditor;
    vault.last_audit_hash = [0u8; 32];
    vault.last_audit_at = clock.unix_timestamp;
    vault.collateral_type = params.collateral_type;
    vault.status = VaultStatus::Active;
    vault.created_at = clock.unix_timestamp;
    vault.bump = ctx.bumps.collateral_vault;

    emit!(VaultInitialized {
        vault: vault.key(),
        mint_config: ctx.accounts.mint_config.key(),
        collateral_type: params.collateral_type,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateCollateral<'info> {
    #[account(
        constraint = authority.key() == collateral_vault.authority @ MeridianError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [CollateralVault::SEED_PREFIX, mint_config.key().as_ref()],
        bump = collateral_vault.bump,
        constraint = collateral_vault.is_active() @ MeridianError::VaultInactive
    )]
    pub collateral_vault: Account<'info, CollateralVault>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateCollateralParams {
    /// Amount to add (positive) or remove (negative expressed as separate flag)
    pub amount: u64,
    /// True = deposit, False = withdrawal
    pub is_deposit: bool,
    /// Proof hash for audit trail
    pub proof_hash: [u8; 32],
}

pub fn update_collateral_handler(
    ctx: Context<UpdateCollateral>,
    params: UpdateCollateralParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.collateral_vault;
    let mint_config = &mut ctx.accounts.mint_config;

    if params.is_deposit {
        vault.total_collateral = vault.total_collateral.saturating_add(params.amount);
        mint_config.total_collateral = mint_config.total_collateral.saturating_add(params.amount);
    } else {
        require!(
            vault.can_withdraw(params.amount),
            MeridianError::InsufficientCollateral
        );
        // Ensure we maintain at least 100% collateralization
        let new_collateral = mint_config.total_collateral.saturating_sub(params.amount);
        require!(
            new_collateral >= mint_config.total_supply,
            MeridianError::CollateralRatioViolation
        );
        vault.total_collateral = vault.total_collateral.saturating_sub(params.amount);
        mint_config.total_collateral = new_collateral;
    }

    mint_config.updated_at = clock.unix_timestamp;

    emit!(CollateralUpdated {
        vault: vault.key(),
        amount: params.amount,
        is_deposit: params.is_deposit,
        proof_hash: params.proof_hash,
        new_total: vault.total_collateral,
        collateral_ratio: mint_config.calculate_collateral_ratio(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SubmitAudit<'info> {
    #[account(
        constraint = Some(auditor.key()) == collateral_vault.auditor @ MeridianError::Unauthorized
    )]
    pub auditor: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [CollateralVault::SEED_PREFIX, mint_config.key().as_ref()],
        bump = collateral_vault.bump,
    )]
    pub collateral_vault: Account<'info, CollateralVault>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitAuditParams {
    /// Verified collateral amount
    pub verified_amount: u64,
    /// Audit proof hash
    pub audit_hash: [u8; 32],
}

pub fn submit_audit_handler(ctx: Context<SubmitAudit>, params: SubmitAuditParams) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.collateral_vault;
    let mint_config = &mut ctx.accounts.mint_config;

    // Update vault with audited values
    vault.total_collateral = params.verified_amount;
    vault.last_audit_hash = params.audit_hash;
    vault.last_audit_at = clock.unix_timestamp;
    vault.status = VaultStatus::Active;

    // Update mint config
    mint_config.total_collateral = params.verified_amount;
    mint_config.last_audit = clock.unix_timestamp;
    mint_config.updated_at = clock.unix_timestamp;

    emit!(AuditSubmitted {
        vault: vault.key(),
        auditor: ctx.accounts.auditor.key(),
        verified_amount: params.verified_amount,
        audit_hash: params.audit_hash,
        collateral_ratio: mint_config.calculate_collateral_ratio(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub mint_config: Pubkey,
    pub collateral_type: CollateralType,
    pub timestamp: i64,
}

#[event]
pub struct CollateralUpdated {
    pub vault: Pubkey,
    pub amount: u64,
    pub is_deposit: bool,
    pub proof_hash: [u8; 32],
    pub new_total: u64,
    pub collateral_ratio: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuditSubmitted {
    pub vault: Pubkey,
    pub auditor: Pubkey,
    pub verified_amount: u64,
    pub audit_hash: [u8; 32],
    pub collateral_ratio: u64,
    pub timestamp: i64,
}
