//! Oracle Program for Price Feeds, TWAP, Volatility, and Funding Rates
//!
//! Cross-bred from: sigma/shared-oracle
//!
//! Provides unified oracle infrastructure for:
//! - Real-time price feeds (JPY/USD, security prices)
//! - Time-Weighted Average Price (TWAP)
//! - Realized and implied volatility
//! - Funding rates from CEX markets
//! - Volatility regime detection

use anchor_lang::prelude::*;

declare_id!("ORCm1111111111111111111111111111111111111111");

/// Maximum price samples to store for TWAP calculation
pub const MAX_PRICE_SAMPLES: usize = 100;

/// Maximum funding rate samples
pub const MAX_FUNDING_SAMPLES: usize = 24;

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized oracle update")]
    Unauthorized,

    #[msg("Price feed is stale")]
    StalePriceFeed,

    #[msg("Invalid price")]
    InvalidPrice,

    #[msg("Insufficient samples for calculation")]
    InsufficientSamples,
}

#[program]
pub mod oracle {
    use super::*;

    /// Initialize a new price feed
    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        params: InitializePriceFeedParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let feed = &mut ctx.accounts.price_feed;

        feed.authority = ctx.accounts.authority.key();
        feed.asset_symbol = params.asset_symbol;
        feed.asset_type = params.asset_type;
        feed.current_price = 0;
        feed.confidence = 0;
        feed.sample_count = 0;
        feed.sample_interval_seconds = params.sample_interval_seconds;
        feed.twap_value = 0;
        feed.ema_value = 0;
        feed.last_sample_time = clock.unix_timestamp;
        feed.last_update_time = clock.unix_timestamp;
        feed.is_active = true;
        feed.created_at = clock.unix_timestamp;
        feed.bump = ctx.bumps.price_feed;

        Ok(())
    }

    /// Update price feed with new observation
    pub fn update_price(
        ctx: Context<UpdatePrice>,
        price: u64,
        confidence: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let feed = &mut ctx.accounts.price_feed;

        require!(price > 0, OracleError::InvalidPrice);

        // Update current price
        let old_price = feed.current_price;
        feed.current_price = price;
        feed.confidence = confidence;
        feed.last_update_time = clock.unix_timestamp;

        // Check if we should add a new sample
        let time_since_last_sample = clock.unix_timestamp - feed.last_sample_time;
        if time_since_last_sample >= feed.sample_interval_seconds as i64 {
            feed.add_sample(price, clock.unix_timestamp);
        }

        // Update EMA (exponential moving average)
        if old_price > 0 {
            // EMA with alpha = 0.1 (scaled by 1000)
            let alpha: u128 = 100;
            let one_minus_alpha: u128 = 900;
            feed.ema_value = ((alpha * price as u128 + one_minus_alpha * feed.ema_value as u128)
                / 1000) as u64;
        } else {
            feed.ema_value = price;
        }

        emit!(PriceUpdated {
            feed: feed.key(),
            price,
            confidence,
            twap: feed.twap_value,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize volatility index for an asset
    pub fn initialize_volatility_index(
        ctx: Context<InitializeVolatilityIndex>,
        asset_symbol: String,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let vol_index = &mut ctx.accounts.volatility_index;

        vol_index.authority = ctx.accounts.authority.key();
        vol_index.price_feed = ctx.accounts.price_feed.key();
        vol_index.asset_symbol = asset_symbol;
        vol_index.realized_volatility = 0;
        vol_index.implied_volatility = 0;
        vol_index.regime = VolatilityRegime::Normal;
        vol_index.mean_reversion_signal = 0;
        vol_index.observation_count = 0;
        vol_index.last_update = clock.unix_timestamp;
        vol_index.bump = ctx.bumps.volatility_index;

        Ok(())
    }

    /// Update volatility index with new observation
    pub fn update_volatility(
        ctx: Context<UpdateVolatility>,
        realized_vol: u64,
        implied_vol: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let vol_index = &mut ctx.accounts.volatility_index;

        vol_index.realized_volatility = realized_vol;
        vol_index.implied_volatility = implied_vol;
        vol_index.observation_count += 1;
        vol_index.last_update = clock.unix_timestamp;

        // Detect volatility regime
        vol_index.regime = if realized_vol < 500 {
            VolatilityRegime::VeryLow
        } else if realized_vol < 1500 {
            VolatilityRegime::Low
        } else if realized_vol < 3000 {
            VolatilityRegime::Normal
        } else if realized_vol < 5000 {
            VolatilityRegime::High
        } else {
            VolatilityRegime::Extreme
        };

        // Mean reversion signal (implied - realized)
        vol_index.mean_reversion_signal = implied_vol as i64 - realized_vol as i64;

        emit!(VolatilityUpdated {
            index: vol_index.key(),
            realized: realized_vol,
            implied: implied_vol,
            regime: vol_index.regime,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize funding rate feed
    pub fn initialize_funding_feed(
        ctx: Context<InitializeFundingFeed>,
        market_symbol: String,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let feed = &mut ctx.accounts.funding_feed;

        feed.authority = ctx.accounts.authority.key();
        feed.market_symbol = market_symbol;
        feed.current_rate = 0;
        feed.aggregated_rate = 0;
        feed.sample_count = 0;
        feed.last_update = clock.unix_timestamp;
        feed.bump = ctx.bumps.funding_feed;

        Ok(())
    }

    /// Update funding rate
    pub fn update_funding_rate(
        ctx: Context<UpdateFundingRate>,
        rate: i64,
        source: FundingSource,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let feed = &mut ctx.accounts.funding_feed;

        feed.add_sample(rate, source, clock.unix_timestamp);

        emit!(FundingRateUpdated {
            feed: feed.key(),
            rate,
            aggregated: feed.aggregated_rate,
            source,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// State structures

#[account]
pub struct PriceFeed {
    /// Authority that can update the feed
    pub authority: Pubkey,

    /// Asset symbol (e.g., "JPY", "SBI")
    pub asset_symbol: String,

    /// Asset type
    pub asset_type: AssetType,

    /// Current price (scaled by 1e6)
    pub current_price: u64,

    /// Confidence interval (scaled by 1e6)
    pub confidence: u64,

    /// Number of samples stored
    pub sample_count: u32,

    /// Sample interval in seconds
    pub sample_interval_seconds: u32,

    /// Price samples for TWAP (circular buffer)
    pub samples: [PriceSample; MAX_PRICE_SAMPLES],

    /// Sample write index
    pub sample_index: u32,

    /// Time-weighted average price
    pub twap_value: u64,

    /// Exponential moving average
    pub ema_value: u64,

    /// Last sample timestamp
    pub last_sample_time: i64,

    /// Last update timestamp
    pub last_update_time: i64,

    /// Is feed active
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl PriceFeed {
    pub const SEED_PREFIX: &'static [u8] = b"price_feed";
    pub const MAX_STALENESS: i64 = 300; // 5 minutes

    pub fn is_stale(&self, current_time: i64) -> bool {
        current_time - self.last_update_time > Self::MAX_STALENESS
    }

    pub fn add_sample(&mut self, price: u64, timestamp: i64) {
        let idx = (self.sample_index as usize) % MAX_PRICE_SAMPLES;
        self.samples[idx] = PriceSample { price, timestamp };
        self.sample_index = self.sample_index.wrapping_add(1);
        self.sample_count = self.sample_count.saturating_add(1).min(MAX_PRICE_SAMPLES as u32);
        self.last_sample_time = timestamp;

        // Recalculate TWAP
        self.calculate_twap();
    }

    fn calculate_twap(&mut self) {
        if self.sample_count < 2 {
            self.twap_value = self.current_price;
            return;
        }

        let count = (self.sample_count as usize).min(MAX_PRICE_SAMPLES);
        let mut total_weighted_price: u128 = 0;
        let mut total_time: i64 = 0;

        for i in 1..count {
            let curr_idx = (self.sample_index as usize + MAX_PRICE_SAMPLES - i) % MAX_PRICE_SAMPLES;
            let prev_idx = (self.sample_index as usize + MAX_PRICE_SAMPLES - i - 1) % MAX_PRICE_SAMPLES;

            let time_delta = self.samples[curr_idx].timestamp - self.samples[prev_idx].timestamp;
            if time_delta > 0 {
                total_weighted_price += self.samples[prev_idx].price as u128 * time_delta as u128;
                total_time += time_delta;
            }
        }

        if total_time > 0 {
            self.twap_value = (total_weighted_price / total_time as u128) as u64;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct PriceSample {
    pub price: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AssetType {
    /// Fiat currency (JPY, USD)
    Fiat,
    /// Tokenized equity
    Equity,
    /// RWA
    Rwa,
    /// Cryptocurrency
    Crypto,
    /// Index
    Index,
}

#[account]
pub struct VolatilityIndex {
    pub authority: Pubkey,
    pub price_feed: Pubkey,
    pub asset_symbol: String,
    pub realized_volatility: u64,
    pub implied_volatility: u64,
    pub regime: VolatilityRegime,
    pub mean_reversion_signal: i64,
    pub observation_count: u32,
    pub last_update: i64,
    pub bump: u8,
}

impl VolatilityIndex {
    pub const SEED_PREFIX: &'static [u8] = b"volatility_index";
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VolatilityRegime {
    VeryLow,
    Low,
    Normal,
    High,
    Extreme,
}

#[account]
pub struct FundingFeed {
    pub authority: Pubkey,
    pub market_symbol: String,
    pub current_rate: i64,
    pub aggregated_rate: i64,
    pub samples: [FundingSample; MAX_FUNDING_SAMPLES],
    pub sample_index: u32,
    pub sample_count: u32,
    pub last_update: i64,
    pub bump: u8,
}

impl FundingFeed {
    pub const SEED_PREFIX: &'static [u8] = b"funding_feed";

    pub fn add_sample(&mut self, rate: i64, source: FundingSource, timestamp: i64) {
        let idx = (self.sample_index as usize) % MAX_FUNDING_SAMPLES;
        self.samples[idx] = FundingSample {
            rate,
            source,
            timestamp,
        };
        self.sample_index = self.sample_index.wrapping_add(1);
        self.sample_count = self.sample_count.saturating_add(1).min(MAX_FUNDING_SAMPLES as u32);
        self.current_rate = rate;
        self.last_update = timestamp;

        // Calculate aggregated rate (average of recent samples)
        let count = (self.sample_count as usize).min(MAX_FUNDING_SAMPLES);
        let sum: i64 = self.samples[..count].iter().map(|s| s.rate).sum();
        self.aggregated_rate = sum / count as i64;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct FundingSample {
    pub rate: i64,
    pub source: FundingSource,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum FundingSource {
    #[default]
    Internal,
    Binance,
    Bybit,
    OKX,
    Drift,
    Pyth,
}

// Accounts

#[derive(Accounts)]
#[instruction(params: InitializePriceFeedParams)]
pub struct InitializePriceFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 8 + 8 + 4 + 4 + (16 * MAX_PRICE_SAMPLES) + 4 + 8 + 8 + 8 + 8 + 1 + 8 + 1,
        seeds = [PriceFeed::SEED_PREFIX, params.asset_symbol.as_bytes()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializePriceFeedParams {
    pub asset_symbol: String,
    pub asset_type: AssetType,
    pub sample_interval_seconds: u32,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        constraint = authority.key() == price_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
#[instruction(asset_symbol: String)]
pub struct InitializeVolatilityIndex<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 4 + 8 + 1,
        seeds = [VolatilityIndex::SEED_PREFIX, asset_symbol.as_bytes()],
        bump
    )]
    pub volatility_index: Account<'info, VolatilityIndex>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVolatility<'info> {
    #[account(
        constraint = authority.key() == volatility_index.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub volatility_index: Account<'info, VolatilityIndex>,
}

#[derive(Accounts)]
#[instruction(market_symbol: String)]
pub struct InitializeFundingFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8 + (24 * MAX_FUNDING_SAMPLES) + 4 + 4 + 8 + 1,
        seeds = [FundingFeed::SEED_PREFIX, market_symbol.as_bytes()],
        bump
    )]
    pub funding_feed: Account<'info, FundingFeed>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFundingRate<'info> {
    #[account(
        constraint = authority.key() == funding_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub funding_feed: Account<'info, FundingFeed>,
}

// Events

#[event]
pub struct PriceUpdated {
    pub feed: Pubkey,
    pub price: u64,
    pub confidence: u64,
    pub twap: u64,
    pub timestamp: i64,
}

#[event]
pub struct VolatilityUpdated {
    pub index: Pubkey,
    pub realized: u64,
    pub implied: u64,
    pub regime: VolatilityRegime,
    pub timestamp: i64,
}

#[event]
pub struct FundingRateUpdated {
    pub feed: Pubkey,
    pub rate: i64,
    pub aggregated: i64,
    pub source: FundingSource,
    pub timestamp: i64,
}
