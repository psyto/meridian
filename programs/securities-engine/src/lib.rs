//! Securities Trading Engine
//!
//! 24/7 trading infrastructure for tokenized securities and RWA-linked instruments.
//! Supports spot markets (AMM), perpetual futures, and exotic derivatives.
//!
//! Built with patterns from:
//! - AMM mechanics (x*y=k formula)
//! - Pool structure and LP tokens
//! - Variance swaps
//! - Funding rate derivatives
//!
//! Features:
//! - Constant product AMM for spot trading
//! - Perpetual futures with funding rate
//! - Variance and funding rate swaps
//! - Order book for limit orders
//! - TWAP oracle integration
//! - AI agent compatible

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint, MintTo, Burn};

pub mod state;
use state::*;

declare_id!("7eoNfGXF5kdonbCwAs1tvaPc5HZFnVC2pgiFDnuG3yTe");

#[error_code]
pub enum SecuritiesError {
    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Position not found")]
    PositionNotFound,

    #[msg("Position is not liquidatable")]
    NotLiquidatable,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Invalid leverage")]
    InvalidLeverage,

    #[msg("Order not active")]
    OrderNotActive,

    #[msg("Order expired")]
    OrderExpired,

    #[msg("Math overflow")]
    MathOverflow,
}

#[program]
pub mod securities_engine {
    use super::*;

    /// Initialize a new market
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        params: InitializeMarketParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market = &mut ctx.accounts.market;

        market.authority = ctx.accounts.authority.key();
        market.security_mint = ctx.accounts.security_mint.key();
        market.quote_mint = ctx.accounts.quote_mint.key();
        market.market_type = params.market_type;
        market.status = MarketStatus::Active;
        market.oracle = params.oracle;
        market.trading_fee_bps = params.trading_fee_bps;
        market.protocol_fee_bps = params.protocol_fee_bps;
        market.min_trade_size = params.min_trade_size;
        market.max_trade_size = params.max_trade_size;
        market.total_volume = 0;
        market.total_fees = 0;
        market.volume_24h = 0;
        market.volume_24h_reset = clock.unix_timestamp;
        let symbol = params.symbol;
        market.symbol = symbol.clone();
        market.name = params.name;
        market.isin = params.isin;
        market.is_active = true;
        market.created_at = clock.unix_timestamp;
        market.bump = ctx.bumps.market;

        emit!(MarketCreated {
            market: market.key(),
            symbol,
            market_type: params.market_type,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize AMM pool for a market
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let clock = Clock::get()?;
        let pool = &mut ctx.accounts.pool;

        pool.market = ctx.accounts.market.key();
        pool.security_liquidity = 0;
        pool.quote_liquidity = 0;
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.lp_supply = 0;
        pool.authority = ctx.accounts.pool_authority.key();
        pool.security_vault = ctx.accounts.security_vault.key();
        pool.quote_vault = ctx.accounts.quote_vault.key();
        pool.accumulated_fees_security = 0;
        pool.accumulated_fees_quote = 0;
        pool.twap = 0;
        pool.twap_last_update = clock.unix_timestamp;
        pool.cumulative_price = 0;
        pool.k_last = 0;
        pool.is_active = true;
        pool.created_at = clock.unix_timestamp;
        pool.bump = ctx.bumps.pool;

        Ok(())
    }

    /// Add liquidity to pool
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        security_amount: u64,
        quote_amount: u64,
        min_lp_tokens: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_active, SecuritiesError::MarketNotActive);
        require!(security_amount > 0 && quote_amount > 0, SecuritiesError::InvalidAmount);

        // Calculate LP tokens to mint
        let lp_tokens = pool.calculate_lp_tokens(security_amount, quote_amount)
            .ok_or(SecuritiesError::MathOverflow)?;

        require!(lp_tokens >= min_lp_tokens, SecuritiesError::SlippageExceeded);

        // Transfer tokens to pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_security.to_account_info(),
                    to: ctx.accounts.security_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            security_amount,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_quote.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            quote_amount,
        )?;

        // Mint LP tokens
        let market_key = ctx.accounts.market.key();
        let seeds = &[Pool::SEED_PREFIX, market_key.as_ref(), &[pool.bump]];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                signer_seeds,
            ),
            lp_tokens,
        )?;

        // Update pool state
        pool.security_liquidity = pool.security_liquidity.saturating_add(security_amount);
        pool.quote_liquidity = pool.quote_liquidity.saturating_add(quote_amount);
        pool.lp_supply = pool.lp_supply.saturating_add(lp_tokens);
        pool.k_last = pool.security_liquidity as u128 * pool.quote_liquidity as u128;
        pool.update_twap(clock.unix_timestamp);

        emit!(LiquidityAdded {
            pool: pool.key(),
            provider: ctx.accounts.user.key(),
            security_amount,
            quote_amount,
            lp_tokens,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Swap tokens in the AMM pool
    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        is_security_input: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market = &ctx.accounts.market;
        let pool = &mut ctx.accounts.pool;

        require!(market.is_trading(), SecuritiesError::MarketNotActive);
        require!(amount_in > 0, SecuritiesError::InvalidAmount);
        require!(amount_in >= market.min_trade_size, SecuritiesError::InvalidAmount);
        if market.max_trade_size > 0 {
            require!(amount_in <= market.max_trade_size, SecuritiesError::InvalidAmount);
        }

        // Calculate output
        let (amount_out, fee) = pool
            .calculate_swap_output(amount_in, is_security_input, market.trading_fee_bps)
            .ok_or(SecuritiesError::InsufficientLiquidity)?;

        require!(amount_out >= min_amount_out, SecuritiesError::SlippageExceeded);

        // Transfer input tokens
        let (from_account, to_vault) = if is_security_input {
            (
                ctx.accounts.user_security.to_account_info(),
                ctx.accounts.security_vault.to_account_info(),
            )
        } else {
            (
                ctx.accounts.user_quote.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
            )
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: from_account,
                    to: to_vault,
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;

        // Transfer output tokens from vault
        let market_key = ctx.accounts.market.key();
        let seeds = &[Pool::SEED_PREFIX, market_key.as_ref(), &[pool.bump]];
        let signer_seeds = &[&seeds[..]];

        let (from_vault, to_account) = if is_security_input {
            (
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.user_quote.to_account_info(),
            )
        } else {
            (
                ctx.accounts.security_vault.to_account_info(),
                ctx.accounts.user_security.to_account_info(),
            )
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: from_vault,
                    to: to_account,
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount_out,
        )?;

        // Update pool state
        if is_security_input {
            pool.security_liquidity = pool.security_liquidity.saturating_add(amount_in);
            pool.quote_liquidity = pool.quote_liquidity.saturating_sub(amount_out);
            pool.accumulated_fees_security = pool.accumulated_fees_security.saturating_add(fee);
        } else {
            pool.quote_liquidity = pool.quote_liquidity.saturating_add(amount_in);
            pool.security_liquidity = pool.security_liquidity.saturating_sub(amount_out);
            pool.accumulated_fees_quote = pool.accumulated_fees_quote.saturating_add(fee);
        }

        pool.update_twap(clock.unix_timestamp);

        // Update market volume
        let market = &mut ctx.accounts.market;
        let volume = if is_security_input { amount_out } else { amount_in };
        market.update_volume(volume, clock.unix_timestamp);
        market.total_fees = market.total_fees.saturating_add(fee);

        emit!(SwapExecuted {
            pool: pool.key(),
            user: ctx.accounts.user.key(),
            amount_in,
            amount_out,
            fee,
            is_security_input,
            price: pool.get_spot_price(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Open a perpetual position
    pub fn open_position(
        ctx: Context<OpenPosition>,
        params: OpenPositionParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.is_trading(), SecuritiesError::MarketNotActive);
        require!(params.leverage >= 1 && params.leverage <= 100, SecuritiesError::InvalidLeverage);

        let required_collateral = params.size / params.leverage as u64;
        require!(params.collateral >= required_collateral, SecuritiesError::InsufficientCollateral);

        // Transfer collateral
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_quote.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            params.collateral,
        )?;

        // Initialize position
        position.owner = ctx.accounts.user.key();
        position.market = market.key();
        position.position_type = params.position_type;
        position.side = params.side;
        position.size = params.size;
        position.entry_price = params.entry_price;
        position.leverage = params.leverage;
        position.collateral = params.collateral;
        position.unrealized_pnl = 0;
        position.accumulated_funding = 0;
        position.last_funding_update = clock.unix_timestamp;
        position.liquidation_price = position.calculate_liquidation_price();
        position.take_profit = params.take_profit;
        position.stop_loss = params.stop_loss;
        position.is_open = true;
        position.created_at = clock.unix_timestamp;
        position.updated_at = clock.unix_timestamp;
        position.bump = ctx.bumps.position;

        emit!(PositionOpened {
            position: position.key(),
            owner: ctx.accounts.user.key(),
            market: market.key(),
            side: params.side,
            size: params.size,
            entry_price: params.entry_price,
            leverage: params.leverage,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// Account structs
#[derive(Accounts)]
#[instruction(params: InitializeMarketParams)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub security_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED_PREFIX, security_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [Pool::SEED_PREFIX, market.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: PDA authority for the pool
    #[account(seeds = [b"pool_authority", market.key().as_ref()], bump)]
    pub pool_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = pool_authority,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = security_mint,
        token::authority = pool_authority,
    )]
    pub security_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = quote_mint,
        token::authority = pool_authority,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    pub security_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Account<'info, Market>,

    #[account(mut, seeds = [Pool::SEED_PREFIX, market.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    /// CHECK: Pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub security_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_security: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_quote: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_lp: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [Pool::SEED_PREFIX, market.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    /// CHECK: Pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub security_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_security: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_quote: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(params: OpenPositionParams)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [Position::SEED_PREFIX, user.key().as_ref(), market.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_quote: Account<'info, TokenAccount>,

    #[account(mut)]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// Params
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeMarketParams {
    pub market_type: MarketType,
    pub oracle: Pubkey,
    pub trading_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub min_trade_size: u64,
    pub max_trade_size: u64,
    pub symbol: String,
    pub name: String,
    pub isin: Option<[u8; 12]>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OpenPositionParams {
    pub position_type: PositionType,
    pub side: Side,
    pub size: u64,
    pub entry_price: u64,
    pub leverage: u8,
    pub collateral: u64,
    pub take_profit: u64,
    pub stop_loss: u64,
}

// Events
#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub symbol: String,
    pub market_type: MarketType,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityAdded {
    pub pool: Pubkey,
    pub provider: Pubkey,
    pub security_amount: u64,
    pub quote_amount: u64,
    pub lp_tokens: u64,
    pub timestamp: i64,
}

#[event]
pub struct SwapExecuted {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub fee: u64,
    pub is_security_input: bool,
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionOpened {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: Side,
    pub size: u64,
    pub entry_price: u64,
    pub leverage: u8,
    pub timestamp: i64,
}
