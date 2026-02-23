use anchor_lang::prelude::*;

use crate::errors::MeridianError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + RoleConfig::INIT_SPACE,
        seeds = [RoleConfig::SEED_PREFIX, mint_config.key().as_ref()],
        bump
    )]
    pub role_config: Account<'info, RoleConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = authority.key() == mint_config.authority @ MeridianError::Unauthorized
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [RoleConfig::SEED_PREFIX, mint_config.key().as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateRolesParams {
    pub minter: Option<Option<Pubkey>>,
    pub burner: Option<Option<Pubkey>>,
    pub blacklister: Option<Option<Pubkey>>,
    pub pauser: Option<Option<Pubkey>>,
    pub seizer: Option<Option<Pubkey>>,
}

pub fn initialize_roles_handler(ctx: Context<InitializeRoles>) -> Result<()> {
    let role_config = &mut ctx.accounts.role_config;

    role_config.master_authority = ctx.accounts.authority.key();
    role_config.minter = None;
    role_config.burner = None;
    role_config.blacklister = None;
    role_config.pauser = None;
    role_config.seizer = None;
    role_config.mint_config = ctx.accounts.mint_config.key();
    role_config.bump = ctx.bumps.role_config;

    emit!(RolesInitialized {
        mint_config: ctx.accounts.mint_config.key(),
        master_authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    params: UpdateRolesParams,
) -> Result<()> {
    let role_config = &mut ctx.accounts.role_config;

    if let Some(minter) = params.minter {
        role_config.minter = minter;
    }
    if let Some(burner) = params.burner {
        role_config.burner = burner;
    }
    if let Some(blacklister) = params.blacklister {
        role_config.blacklister = blacklister;
    }
    if let Some(pauser) = params.pauser {
        role_config.pauser = pauser;
    }
    if let Some(seizer) = params.seizer {
        role_config.seizer = seizer;
    }

    emit!(RolesUpdated {
        mint_config: ctx.accounts.mint_config.key(),
        updated_by: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[event]
pub struct RolesInitialized {
    pub mint_config: Pubkey,
    pub master_authority: Pubkey,
}

#[event]
pub struct RolesUpdated {
    pub mint_config: Pubkey,
    pub updated_by: Pubkey,
}
