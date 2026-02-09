use anchor_lang::prelude::*;

/// Tokenized securities market configuration
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Market authority
    pub authority: Pubkey,

    /// Security token mint (tokenized equity/RWA)
    pub security_mint: Pubkey,

    /// Quote token mint (JPY stablecoin)
    pub quote_mint: Pubkey,

    /// Market type
    pub market_type: MarketType,

    /// Market status
    pub status: MarketStatus,

    /// Oracle price feed
    pub oracle: Pubkey,

    /// Trading fee in basis points (30 = 0.3%)
    pub trading_fee_bps: u16,

    /// Protocol fee in basis points (5 = 0.05%)
    pub protocol_fee_bps: u16,

    /// Minimum trade size
    pub min_trade_size: u64,

    /// Maximum trade size (0 = unlimited)
    pub max_trade_size: u64,

    /// Total trading volume (in quote)
    pub total_volume: u64,

    /// Total fees collected (in quote)
    pub total_fees: u64,

    /// 24h volume
    pub volume_24h: u64,

    /// Last volume reset
    pub volume_24h_reset: i64,

    /// Symbol (e.g., "MERI", "SONY")
    #[max_len(10)]
    pub symbol: String,

    /// Full name
    #[max_len(50)]
    pub name: String,

    /// ISIN (International Securities Identification Number)
    pub isin: Option<[u8; 12]>,

    /// Is market active for trading
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketType {
    /// Spot market for tokenized equities
    Equity,
    /// RWA-linked instruments
    Rwa,
    /// Perpetual futures
    Perpetual,
    /// Funding rate swaps
    FundingSwap,
    /// Variance swaps
    VarianceSwap,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    /// Market is active
    Active,
    /// Market is paused (no new trades)
    Paused,
    /// Market is in settlement
    Settling,
    /// Market is closed
    Closed,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";
    pub const SECONDS_PER_DAY: i64 = 86400;

    pub fn is_trading(&self) -> bool {
        self.is_active && matches!(self.status, MarketStatus::Active)
    }

    pub fn calculate_fee(&self, amount: u64) -> u64 {
        ((amount as u128 * self.trading_fee_bps as u128) / 10000) as u64
    }

    pub fn calculate_protocol_fee(&self, fee: u64) -> u64 {
        ((fee as u128 * self.protocol_fee_bps as u128) / self.trading_fee_bps as u128) as u64
    }

    pub fn update_volume(&mut self, amount: u64, current_time: i64) {
        self.total_volume = self.total_volume.saturating_add(amount);

        if current_time - self.volume_24h_reset >= Self::SECONDS_PER_DAY {
            self.volume_24h = amount;
            self.volume_24h_reset = current_time;
        } else {
            self.volume_24h = self.volume_24h.saturating_add(amount);
        }
    }
}
