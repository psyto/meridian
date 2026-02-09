use anchor_lang::prelude::*;

/// Derivatives position for perpetuals and swaps
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Position owner
    pub owner: Pubkey,

    /// Associated market
    pub market: Pubkey,

    /// Position type
    pub position_type: PositionType,

    /// Side (long/short)
    pub side: Side,

    /// Notional size (in quote)
    pub size: u64,

    /// Entry price (scaled by 1e6)
    pub entry_price: u64,

    /// Leverage (1-100x)
    pub leverage: u8,

    /// Collateral amount (in quote)
    pub collateral: u64,

    /// Unrealized PnL (can be negative, stored as i128)
    pub unrealized_pnl: i128,

    /// Accumulated funding payments
    pub accumulated_funding: i128,

    /// Last funding update
    pub last_funding_update: i64,

    /// Liquidation price (scaled by 1e6)
    pub liquidation_price: u64,

    /// Take profit price (0 = none)
    pub take_profit: u64,

    /// Stop loss price (0 = none)
    pub stop_loss: u64,

    /// Is position open
    pub is_open: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionType {
    /// Perpetual futures
    Perpetual,
    /// Variance swap (volatility trading)
    VarianceSwap,
    /// Funding rate swap
    FundingSwap,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Long,
    Short,
}

impl Position {
    pub const SEED_PREFIX: &'static [u8] = b"position";
    pub const PRICE_PRECISION: u64 = 1_000_000; // 1e6
    pub const MAINTENANCE_MARGIN_BPS: u64 = 500; // 5%

    /// Calculate unrealized PnL
    pub fn calculate_pnl(&self, current_price: u64) -> i128 {
        let price_diff = current_price as i128 - self.entry_price as i128;
        let pnl = match self.side {
            Side::Long => (self.size as i128 * price_diff) / Self::PRICE_PRECISION as i128,
            Side::Short => (self.size as i128 * -price_diff) / Self::PRICE_PRECISION as i128,
        };
        pnl + self.accumulated_funding
    }

    /// Check if position is liquidatable
    pub fn is_liquidatable(&self, current_price: u64) -> bool {
        let pnl = self.calculate_pnl(current_price);
        let equity = self.collateral as i128 + pnl;
        let maintenance_margin = (self.size as i128 * Self::MAINTENANCE_MARGIN_BPS as i128) / 10000;
        equity < maintenance_margin
    }

    /// Calculate liquidation price
    pub fn calculate_liquidation_price(&self) -> u64 {
        let maintenance_margin = (self.size as u128 * Self::MAINTENANCE_MARGIN_BPS as u128) / 10000;
        let max_loss = self.collateral as u128 - maintenance_margin;
        let price_move = (max_loss * Self::PRICE_PRECISION as u128) / self.size as u128;

        match self.side {
            Side::Long => self.entry_price.saturating_sub(price_move as u64),
            Side::Short => self.entry_price.saturating_add(price_move as u64),
        }
    }

    /// Apply funding payment
    pub fn apply_funding(&mut self, funding_rate: i64, current_time: i64) {
        let time_elapsed = current_time - self.last_funding_update;
        if time_elapsed <= 0 {
            return;
        }

        // Funding = size * rate * time / (8 hours in seconds)
        let funding = (self.size as i128 * funding_rate as i128 * time_elapsed as i128)
            / (8 * 3600);

        self.accumulated_funding += match self.side {
            Side::Long => -funding, // Longs pay when rate is positive
            Side::Short => funding,  // Shorts receive when rate is positive
        };

        self.last_funding_update = current_time;
    }

    /// Calculate margin ratio
    pub fn margin_ratio(&self, current_price: u64) -> u64 {
        let pnl = self.calculate_pnl(current_price);
        let equity = (self.collateral as i128 + pnl).max(0) as u64;
        if self.size == 0 {
            return 10000; // 100%
        }
        (equity as u128 * 10000 / self.size as u128) as u64
    }
}

/// Variance swap specific data
#[account]
#[derive(InitSpace)]
pub struct VarianceSwapData {
    /// Associated position
    pub position: Pubkey,

    /// Strike variance (annualized, scaled by 1e6)
    pub strike_variance: u64,

    /// Realized variance accumulated
    pub realized_variance: u64,

    /// Number of observations
    pub observation_count: u32,

    /// Variance notional
    pub variance_notional: u64,

    /// Settlement date
    pub settlement_date: i64,

    /// Is settled
    pub is_settled: bool,

    /// Bump seed
    pub bump: u8,
}

impl VarianceSwapData {
    pub const SEED_PREFIX: &'static [u8] = b"variance_swap";

    /// Calculate settlement amount
    pub fn calculate_settlement(&self) -> i128 {
        let variance_diff = self.realized_variance as i128 - self.strike_variance as i128;
        (self.variance_notional as i128 * variance_diff) / 1_000_000
    }
}
