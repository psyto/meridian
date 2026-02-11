use anchor_lang::prelude::*;

/// Authorized issuer/distributor for stablecoin
#[account]
#[derive(InitSpace)]
pub struct Issuer {
    /// Issuer's public key
    pub authority: Pubkey,

    /// Associated mint config
    pub mint_config: Pubkey,

    /// Issuer type
    pub issuer_type: IssuerType,

    /// Daily mint limit (0 = unlimited)
    pub daily_mint_limit: u64,

    /// Daily burn limit (0 = unlimited)
    pub daily_burn_limit: u64,

    /// Current daily minted amount
    pub daily_minted: u64,

    /// Current daily burned amount
    pub daily_burned: u64,

    /// Last daily reset timestamp
    pub last_daily_reset: i64,

    /// Total minted all time
    pub total_minted: u64,

    /// Total burned all time
    pub total_burned: u64,

    /// Is active
    pub is_active: bool,

    /// Registration timestamp
    pub registered_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum IssuerType {
    /// Primary issuer (Trust Bank)
    TrustBank,
    /// Distributor
    Distributor,
    /// Exchange operator
    Exchange,
    /// API partner
    ApiPartner,
}

impl Issuer {
    pub const SEED_PREFIX: &'static [u8] = b"issuer";
    pub const SECONDS_PER_DAY: i64 = 86400;

    /// Reset daily limits if new day
    pub fn maybe_reset_daily(&mut self, current_time: i64) {
        if current_time - self.last_daily_reset >= Self::SECONDS_PER_DAY {
            self.daily_minted = 0;
            self.daily_burned = 0;
            self.last_daily_reset = current_time;
        }
    }

    /// Check if mint is within daily limit
    pub fn can_mint(&self, amount: u64) -> bool {
        if !self.is_active {
            return false;
        }
        if self.daily_mint_limit == 0 {
            return true; // Unlimited
        }
        self.daily_minted.saturating_add(amount) <= self.daily_mint_limit
    }

    /// Check if burn is within daily limit
    pub fn can_burn(&self, amount: u64) -> bool {
        if !self.is_active {
            return false;
        }
        if self.daily_burn_limit == 0 {
            return true; // Unlimited
        }
        self.daily_burned.saturating_add(amount) <= self.daily_burn_limit
    }

    /// Record mint
    pub fn record_mint(&mut self, amount: u64) {
        self.daily_minted = self.daily_minted.saturating_add(amount);
        self.total_minted = self.total_minted.saturating_add(amount);
    }

    /// Record burn
    pub fn record_burn(&mut self, amount: u64) {
        self.daily_burned = self.daily_burned.saturating_add(amount);
        self.total_burned = self.total_burned.saturating_add(amount);
    }
}
