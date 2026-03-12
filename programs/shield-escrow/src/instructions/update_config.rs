use anchor_lang::prelude::*;

use crate::errors::ShieldError;
use crate::state::ShieldConfig;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = authority.key() == shield_config.authority @ ShieldError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ShieldConfig::SEED_PREFIX],
        bump = shield_config.bump,
    )]
    pub shield_config: Account<'info, ShieldConfig>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    fee_bps: Option<u16>,
    fee_recipient: Option<Pubkey>,
    is_active: Option<bool>,
) -> Result<()> {
    let config = &mut ctx.accounts.shield_config;

    if let Some(fee_bps) = fee_bps {
        require!(fee_bps <= ShieldConfig::MAX_FEE_BPS, ShieldError::FeeTooHigh);
        config.fee_bps = fee_bps;
    }

    if let Some(fee_recipient) = fee_recipient {
        config.fee_recipient = fee_recipient;
    }

    if let Some(is_active) = is_active {
        config.is_active = is_active;
    }

    emit!(ConfigUpdated {
        fee_bps: config.fee_bps,
        fee_recipient: config.fee_recipient,
        is_active: config.is_active,
    });

    Ok(())
}

#[event]
pub struct ConfigUpdated {
    pub fee_bps: u16,
    pub fee_recipient: Pubkey,
    pub is_active: bool,
}
