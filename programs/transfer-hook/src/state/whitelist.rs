use anchor_lang::prelude::*;

/// Whitelist entry for a verified wallet
#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    /// Wallet address
    pub wallet: Pubkey,

    /// Associated KYC registry
    pub registry: Pubkey,

    /// KYC verification level
    pub kyc_level: KycLevel,

    /// User's jurisdiction
    pub jurisdiction: Jurisdiction,

    /// Encrypted KYC data hash (NaCl box)
    pub kyc_hash: [u8; 32],

    /// Is entry active
    pub is_active: bool,

    /// Daily transaction limit (0 = unlimited for trust-type)
    pub daily_limit: u64,

    /// Accumulated daily volume
    pub daily_volume: u64,

    /// Last volume reset timestamp
    pub volume_reset_time: i64,

    /// Verification timestamp
    pub verified_at: i64,

    /// Expiry timestamp
    pub expiry_timestamp: i64,

    /// Last activity timestamp
    pub last_activity: i64,

    /// Bump seed
    pub bump: u8,
}

/// KYC verification levels based on Japanese PSA requirements
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum KycLevel {
    /// Basic verification (email, phone)
    Basic,
    /// Standard verification (ID document)
    Standard,
    /// Enhanced verification (video call, address proof)
    Enhanced,
    /// Institutional (corporate KYC/KYB)
    Institutional,
}

/// Supported jurisdictions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Jurisdiction {
    /// Japan (primary market)
    Japan,
    /// Singapore
    Singapore,
    /// Hong Kong
    HongKong,
    /// EU
    Eu,
    /// USA (restricted)
    Usa,
    /// Other
    Other,
}

impl WhitelistEntry {
    pub const SEED_PREFIX: &'static [u8] = b"whitelist";
    pub const SECONDS_PER_DAY: i64 = 86400;

    /// Check if entry is valid for transfers
    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_active && current_time < self.expiry_timestamp
    }

    /// Check if transfer amount is within daily limit
    pub fn can_transfer(&self, amount: u64, current_time: i64) -> bool {
        if !self.is_valid(current_time) {
            return false;
        }
        if self.daily_limit == 0 {
            return true; // Unlimited (trust-type stablecoin)
        }

        let daily_volume = if current_time - self.volume_reset_time >= Self::SECONDS_PER_DAY {
            0 // Reset for new day
        } else {
            self.daily_volume
        };

        daily_volume.saturating_add(amount) <= self.daily_limit
    }

    /// Update daily volume
    pub fn record_transfer(&mut self, amount: u64, current_time: i64) {
        if current_time - self.volume_reset_time >= Self::SECONDS_PER_DAY {
            self.daily_volume = amount;
            self.volume_reset_time = current_time;
        } else {
            self.daily_volume = self.daily_volume.saturating_add(amount);
        }
        self.last_activity = current_time;
    }

    /// Check if jurisdiction allows transfers
    pub fn jurisdiction_allowed(&self) -> bool {
        !matches!(self.jurisdiction, Jurisdiction::Usa) // USA restricted
    }
}
