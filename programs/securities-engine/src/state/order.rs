use anchor_lang::prelude::*;

/// Limit order for order book trading
#[account]
#[derive(InitSpace)]
pub struct Order {
    /// Order owner
    pub owner: Pubkey,

    /// Associated market
    pub market: Pubkey,

    /// Order side
    pub side: OrderSide,

    /// Order type
    pub order_type: OrderType,

    /// Price (scaled by 1e6, 0 for market orders)
    pub price: u64,

    /// Original size
    pub original_size: u64,

    /// Remaining size
    pub remaining_size: u64,

    /// Filled size
    pub filled_size: u64,

    /// Average fill price
    pub avg_fill_price: u64,

    /// Time in force
    pub time_in_force: TimeInForce,

    /// Order status
    pub status: OrderStatus,

    /// Reduce only (for derivatives)
    pub reduce_only: bool,

    /// Post only (maker only)
    pub post_only: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Expiry timestamp (0 = no expiry)
    pub expires_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderType {
    /// Market order (execute immediately at best price)
    Market,
    /// Limit order (execute at specified price or better)
    Limit,
    /// Stop market (trigger market order at stop price)
    StopMarket,
    /// Stop limit (trigger limit order at stop price)
    StopLimit,
    /// Take profit
    TakeProfit,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TimeInForce {
    /// Good till cancelled
    Gtc,
    /// Immediate or cancel
    Ioc,
    /// Fill or kill
    Fok,
    /// Good till date
    Gtd,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderStatus {
    /// Order is open
    Open,
    /// Order is partially filled
    PartiallyFilled,
    /// Order is fully filled
    Filled,
    /// Order is cancelled
    Cancelled,
    /// Order has expired
    Expired,
}

impl Order {
    pub const SEED_PREFIX: &'static [u8] = b"order";

    pub fn is_active(&self) -> bool {
        matches!(self.status, OrderStatus::Open | OrderStatus::PartiallyFilled)
    }

    pub fn can_match(&self, current_price: u64) -> bool {
        if !self.is_active() {
            return false;
        }

        match self.order_type {
            OrderType::Market => true,
            OrderType::Limit => match self.side {
                OrderSide::Buy => current_price <= self.price,
                OrderSide::Sell => current_price >= self.price,
            },
            OrderType::StopMarket | OrderType::StopLimit => match self.side {
                OrderSide::Buy => current_price >= self.price,
                OrderSide::Sell => current_price <= self.price,
            },
            OrderType::TakeProfit => match self.side {
                OrderSide::Buy => current_price <= self.price,
                OrderSide::Sell => current_price >= self.price,
            },
        }
    }

    pub fn fill(&mut self, amount: u64, price: u64) {
        let total_value = self.avg_fill_price as u128 * self.filled_size as u128
            + price as u128 * amount as u128;

        self.filled_size = self.filled_size.saturating_add(amount);
        self.remaining_size = self.remaining_size.saturating_sub(amount);

        if self.filled_size > 0 {
            self.avg_fill_price = (total_value / self.filled_size as u128) as u64;
        }

        if self.remaining_size == 0 {
            self.status = OrderStatus::Filled;
        } else {
            self.status = OrderStatus::PartiallyFilled;
        }
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expires_at > 0 && current_time >= self.expires_at
    }
}

/// Order book for a market (stores best bid/ask for quick access)
#[account]
#[derive(InitSpace)]
pub struct OrderBook {
    /// Associated market
    pub market: Pubkey,

    /// Best bid price
    pub best_bid: u64,

    /// Best ask price
    pub best_ask: u64,

    /// Total bid volume
    pub bid_volume: u64,

    /// Total ask volume
    pub ask_volume: u64,

    /// Number of open orders
    pub order_count: u32,

    /// Last trade price
    pub last_trade_price: u64,

    /// Last trade timestamp
    pub last_trade_time: i64,

    /// Bump seed
    pub bump: u8,
}

impl OrderBook {
    pub const SEED_PREFIX: &'static [u8] = b"orderbook";

    pub fn spread(&self) -> u64 {
        if self.best_ask > self.best_bid {
            self.best_ask - self.best_bid
        } else {
            0
        }
    }

    pub fn spread_bps(&self) -> u64 {
        if self.best_bid == 0 {
            return 10000;
        }
        (self.spread() as u128 * 10000 / self.best_bid as u128) as u64
    }

    pub fn mid_price(&self) -> u64 {
        if self.best_bid == 0 || self.best_ask == 0 {
            return self.last_trade_price;
        }
        (self.best_bid + self.best_ask) / 2
    }
}
