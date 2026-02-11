use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Burn, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::MeridianError;

#[derive(Accounts)]
pub struct BurnStablecoin<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [MintConfig::SEED_PREFIX],
        bump = mint_config.bump,
        constraint = !mint_config.is_paused @ MeridianError::MintPaused
    )]
    pub mint_config: Account<'info, MintConfig>,

    #[account(
        mut,
        constraint = mint.key() == mint_config.mint @ MeridianError::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Holder's token account to burn from
    #[account(
        mut,
        token::mint = mint,
        token::authority = holder,
    )]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BurnParams {
    pub amount: u64,
    /// Bank account info for fiat redemption (encrypted)
    pub redemption_info: [u8; 64],
}

pub fn handler(ctx: Context<BurnStablecoin>, params: BurnParams) -> Result<()> {
    let clock = Clock::get()?;
    let mint_config = &mut ctx.accounts.mint_config;

    // Validate burning
    require!(
        mint_config.can_burn(params.amount),
        MeridianError::InsufficientSupply
    );
    require!(
        ctx.accounts.holder_token_account.amount >= params.amount,
        MeridianError::InsufficientBalance
    );

    // Burn tokens
    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.holder_token_account.to_account_info(),
        authority: ctx.accounts.holder.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token_2022::burn(cpi_ctx, params.amount)?;

    // Update state
    mint_config.total_supply = mint_config.total_supply.saturating_sub(params.amount);
    mint_config.updated_at = clock.unix_timestamp;

    emit!(StablecoinBurned {
        mint: ctx.accounts.mint.key(),
        holder: ctx.accounts.holder.key(),
        amount: params.amount,
        redemption_info: params.redemption_info,
        total_supply: mint_config.total_supply,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct StablecoinBurned {
    pub mint: Pubkey,
    pub holder: Pubkey,
    pub amount: u64,
    pub redemption_info: [u8; 64],
    pub total_supply: u64,
    pub timestamp: i64,
}
