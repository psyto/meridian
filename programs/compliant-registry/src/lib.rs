use anchor_lang::prelude::*;

pub mod errors;
pub mod state;

use errors::ComplianceError;
use state::*;

declare_id!("CRGm1111111111111111111111111111111111111111");

#[program]
pub mod compliant_registry {
    use super::*;

    /// Create a new compliant pool registry
    pub fn initialize_pool_registry(
        ctx: Context<InitializePoolRegistry>,
        min_kyc_level: KycLevel,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        let clock = Clock::get()?;

        registry.authority = ctx.accounts.authority.key();
        registry.pool_count = 0;
        registry.min_kyc_level = min_kyc_level;
        registry.is_active = true;
        registry.created_at = clock.unix_timestamp;
        registry.updated_at = clock.unix_timestamp;
        registry.bump = ctx.bumps.registry;

        emit!(PoolRegistryCreated {
            registry: registry.key(),
            authority: registry.authority,
            min_kyc_level,
        });

        Ok(())
    }

    /// Register a pool as compliant
    pub fn add_compliant_pool(
        ctx: Context<AddCompliantPool>,
        amm_key: Pubkey,
        dex_label: String,
        jurisdiction: Jurisdiction,
        kyc_level: KycLevel,
        audit_hash: [u8; 32],
        audit_expiry: i64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        let entry = &mut ctx.accounts.pool_entry;
        let clock = Clock::get()?;

        require!(registry.is_active, ComplianceError::RegistryInactive);

        entry.amm_key = amm_key;
        entry.registry = registry.key();
        entry.operator = ctx.accounts.authority.key();
        entry.dex_label = dex_label;
        entry.status = PoolStatus::Active;
        entry.jurisdiction = jurisdiction;
        entry.kyc_level = kyc_level;
        entry.audit_hash = audit_hash;
        entry.audit_expiry = audit_expiry;
        entry.registered_at = clock.unix_timestamp;
        entry.updated_at = clock.unix_timestamp;
        entry.bump = ctx.bumps.pool_entry;

        registry.pool_count = registry.pool_count.saturating_add(1);
        registry.updated_at = clock.unix_timestamp;

        emit!(PoolAdded {
            registry: registry.key(),
            amm_key,
            status: PoolStatus::Active,
        });

        Ok(())
    }

    /// Suspend a pool (temporary, can be reinstated)
    pub fn suspend_pool(ctx: Context<ModifyPool>) -> Result<()> {
        let entry = &mut ctx.accounts.pool_entry;
        let clock = Clock::get()?;

        require!(
            entry.status == PoolStatus::Active,
            ComplianceError::InvalidPoolStatus
        );

        entry.status = PoolStatus::Suspended;
        entry.updated_at = clock.unix_timestamp;

        ctx.accounts.registry.updated_at = clock.unix_timestamp;

        emit!(PoolStatusChanged {
            registry: ctx.accounts.registry.key(),
            amm_key: entry.amm_key,
            new_status: PoolStatus::Suspended,
        });

        Ok(())
    }

    /// Permanently revoke a pool's compliance status
    pub fn revoke_pool(ctx: Context<ModifyPool>) -> Result<()> {
        let entry = &mut ctx.accounts.pool_entry;
        let registry = &mut ctx.accounts.registry;
        let clock = Clock::get()?;

        require!(
            entry.status != PoolStatus::Revoked,
            ComplianceError::PoolAlreadyRevoked
        );

        entry.status = PoolStatus::Revoked;
        entry.updated_at = clock.unix_timestamp;

        registry.pool_count = registry.pool_count.saturating_sub(1);
        registry.updated_at = clock.unix_timestamp;

        emit!(PoolStatusChanged {
            registry: registry.key(),
            amm_key: entry.amm_key,
            new_status: PoolStatus::Revoked,
        });

        Ok(())
    }

    /// Reinstate a suspended pool
    pub fn reinstate_pool(ctx: Context<ModifyPool>) -> Result<()> {
        let entry = &mut ctx.accounts.pool_entry;
        let clock = Clock::get()?;

        require!(
            entry.status == PoolStatus::Suspended,
            ComplianceError::InvalidPoolStatus
        );

        entry.status = PoolStatus::Active;
        entry.updated_at = clock.unix_timestamp;

        ctx.accounts.registry.updated_at = clock.unix_timestamp;

        emit!(PoolStatusChanged {
            registry: ctx.accounts.registry.key(),
            amm_key: entry.amm_key,
            new_status: PoolStatus::Active,
        });

        Ok(())
    }

    /// Initialize compliance config linking pool registry to KYC registry
    pub fn initialize_compliance_config(
        ctx: Context<InitializeComplianceConfig>,
        jurisdiction_bitmask: u8,
        basic_trade_limit: u64,
        standard_trade_limit: u64,
        enhanced_trade_limit: u64,
        zk_verifier_key: Pubkey,
        max_route_hops: u8,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let clock = Clock::get()?;

        config.authority = ctx.accounts.authority.key();
        config.pool_registry = ctx.accounts.registry.key();
        config.kyc_registry = ctx.accounts.kyc_registry.key();
        config.jurisdiction_bitmask = jurisdiction_bitmask;
        config.basic_trade_limit = basic_trade_limit;
        config.standard_trade_limit = standard_trade_limit;
        config.enhanced_trade_limit = enhanced_trade_limit;
        config.zk_verifier_key = zk_verifier_key;
        config.is_active = true;
        config.max_route_hops = max_route_hops;
        config.created_at = clock.unix_timestamp;
        config.updated_at = clock.unix_timestamp;
        config.bump = ctx.bumps.config;

        emit!(ComplianceConfigCreated {
            config: config.key(),
            pool_registry: config.pool_registry,
            kyc_registry: config.kyc_registry,
        });

        Ok(())
    }

    /// Batch-verify that all AMM keys in a route are compliant
    /// Emits a RouteVerified event on success
    pub fn verify_compliant_route(
        ctx: Context<VerifyCompliantRoute>,
        amm_keys: Vec<Pubkey>,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        require!(config.is_active, ComplianceError::ComplianceConfigInactive);
        require!(!amm_keys.is_empty(), ComplianceError::EmptyRoute);
        require!(
            amm_keys.len() <= config.max_route_hops as usize,
            ComplianceError::RouteTooLong
        );

        // Each remaining account should be a PoolComplianceEntry for the corresponding amm_key
        require!(
            ctx.remaining_accounts.len() == amm_keys.len(),
            ComplianceError::NonCompliantRoute
        );

        for (i, amm_key) in amm_keys.iter().enumerate() {
            let account_info = &ctx.remaining_accounts[i];

            // Deserialize the pool entry account
            let pool_entry: Account<PoolComplianceEntry> =
                Account::try_from(account_info)?;

            // Verify it belongs to the correct registry
            require!(
                pool_entry.registry == ctx.accounts.registry.key(),
                ComplianceError::NonCompliantRoute
            );

            // Verify the amm_key matches
            require!(
                pool_entry.amm_key == *amm_key,
                ComplianceError::NonCompliantRoute
            );

            // Verify the pool is active
            require!(
                pool_entry.status == PoolStatus::Active,
                ComplianceError::PoolNotActive
            );

            // Verify audit hasn't expired
            if pool_entry.audit_expiry > 0 {
                require!(
                    clock.unix_timestamp <= pool_entry.audit_expiry,
                    ComplianceError::AuditExpired
                );
            }
        }

        emit!(RouteVerified {
            config: config.key(),
            registry: ctx.accounts.registry.key(),
            hop_count: amm_keys.len() as u8,
            verified_at: clock.unix_timestamp,
        });

        Ok(())
    }
}

// =============================================================================
// Account Contexts
// =============================================================================

#[derive(Accounts)]
pub struct InitializePoolRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CompliantPoolRegistry::INIT_SPACE,
        seeds = [CompliantPoolRegistry::SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, CompliantPoolRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amm_key: Pubkey)]
pub struct AddCompliantPool<'info> {
    #[account(
        mut,
        seeds = [CompliantPoolRegistry::SEED_PREFIX, authority.key().as_ref()],
        bump = registry.bump,
        constraint = registry.authority == authority.key() @ ComplianceError::Unauthorized
    )]
    pub registry: Account<'info, CompliantPoolRegistry>,

    #[account(
        init,
        payer = authority,
        space = 8 + PoolComplianceEntry::INIT_SPACE,
        seeds = [PoolComplianceEntry::SEED_PREFIX, registry.key().as_ref(), amm_key.as_ref()],
        bump
    )]
    pub pool_entry: Account<'info, PoolComplianceEntry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyPool<'info> {
    #[account(
        mut,
        seeds = [CompliantPoolRegistry::SEED_PREFIX, authority.key().as_ref()],
        bump = registry.bump,
        constraint = registry.authority == authority.key() @ ComplianceError::Unauthorized
    )]
    pub registry: Account<'info, CompliantPoolRegistry>,

    #[account(
        mut,
        seeds = [
            PoolComplianceEntry::SEED_PREFIX,
            registry.key().as_ref(),
            pool_entry.amm_key.as_ref()
        ],
        bump = pool_entry.bump,
        constraint = pool_entry.registry == registry.key() @ ComplianceError::Unauthorized
    )]
    pub pool_entry: Account<'info, PoolComplianceEntry>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeComplianceConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ComplianceConfig::INIT_SPACE,
        seeds = [ComplianceConfig::SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(
        seeds = [CompliantPoolRegistry::SEED_PREFIX, authority.key().as_ref()],
        bump = registry.bump,
        constraint = registry.authority == authority.key() @ ComplianceError::Unauthorized
    )]
    pub registry: Account<'info, CompliantPoolRegistry>,

    /// CHECK: Transfer-hook KYC registry account (validated off-chain)
    pub kyc_registry: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyCompliantRoute<'info> {
    #[account(
        seeds = [ComplianceConfig::SEED_PREFIX, config.authority.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(
        seeds = [CompliantPoolRegistry::SEED_PREFIX, config.authority.as_ref()],
        bump = registry.bump,
        constraint = registry.key() == config.pool_registry @ ComplianceError::NonCompliantRoute
    )]
    pub registry: Account<'info, CompliantPoolRegistry>,
    // remaining_accounts: Vec<PoolComplianceEntry> — one per amm_key in the route
}

// =============================================================================
// Events
// =============================================================================

#[event]
pub struct PoolRegistryCreated {
    pub registry: Pubkey,
    pub authority: Pubkey,
    pub min_kyc_level: KycLevel,
}

#[event]
pub struct PoolAdded {
    pub registry: Pubkey,
    pub amm_key: Pubkey,
    pub status: PoolStatus,
}

#[event]
pub struct PoolStatusChanged {
    pub registry: Pubkey,
    pub amm_key: Pubkey,
    pub new_status: PoolStatus,
}

#[event]
pub struct ComplianceConfigCreated {
    pub config: Pubkey,
    pub pool_registry: Pubkey,
    pub kyc_registry: Pubkey,
}

#[event]
pub struct RouteVerified {
    pub config: Pubkey,
    pub registry: Pubkey,
    pub hop_count: u8,
    pub verified_at: i64,
}
