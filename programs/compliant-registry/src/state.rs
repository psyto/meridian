use anchor_lang::prelude::*;

/// KYC verification levels (reused from transfer-hook pattern)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, InitSpace)]
pub enum KycLevel {
    Basic,
    Standard,
    Enhanced,
    Institutional,
}

/// Jurisdiction identifiers (reused from transfer-hook pattern)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Jurisdiction {
    Japan,
    Singapore,
    HongKong,
    Eu,
    Usa,
    Other,
}

/// Pool compliance status lifecycle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolStatus {
    Active,
    Suspended,
    Revoked,
}

/// Registry of compliant pools that an authority manages
#[account]
#[derive(InitSpace)]
pub struct CompliantPoolRegistry {
    /// Authority that can add/remove pools
    pub authority: Pubkey,

    /// Number of pools registered
    pub pool_count: u32,

    /// Minimum KYC level required for traders using this registry
    pub min_kyc_level: KycLevel,

    /// Whether this registry is accepting new registrations and route checks
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// PDA bump
    pub bump: u8,
}

impl CompliantPoolRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"pool_registry";
}

/// Individual pool compliance entry
#[account]
#[derive(InitSpace)]
pub struct PoolComplianceEntry {
    /// The AMM/pool address (Jupiter ammKey)
    pub amm_key: Pubkey,

    /// Parent registry
    pub registry: Pubkey,

    /// Pool operator/authority
    pub operator: Pubkey,

    /// DEX label (e.g. "Raydium", "Orca")
    #[max_len(32)]
    pub dex_label: String,

    /// Current compliance status
    pub status: PoolStatus,

    /// Jurisdiction where the pool operates
    pub jurisdiction: Jurisdiction,

    /// Minimum KYC level required for this specific pool
    pub kyc_level: KycLevel,

    /// Hash of the most recent compliance audit report
    pub audit_hash: [u8; 32],

    /// When the current audit expires
    pub audit_expiry: i64,

    /// When this entry was registered
    pub registered_at: i64,

    /// When this entry was last updated
    pub updated_at: i64,

    /// PDA bump
    pub bump: u8,
}

impl PoolComplianceEntry {
    pub const SEED_PREFIX: &'static [u8] = b"pool_entry";
}

/// Links pool registry to transfer-hook KYC registry and sets trade rules
#[account]
#[derive(InitSpace)]
pub struct ComplianceConfig {
    /// Authority that manages this config
    pub authority: Pubkey,

    /// Pool registry this config is linked to
    pub pool_registry: Pubkey,

    /// Transfer-hook KYC registry address for trader verification
    pub kyc_registry: Pubkey,

    /// Bitmask of allowed jurisdictions (bit 0 = Japan, 1 = Singapore, etc.)
    pub jurisdiction_bitmask: u8,

    /// Maximum trade amount for Basic KYC (0 = unlimited)
    pub basic_trade_limit: u64,

    /// Maximum trade amount for Standard KYC (0 = unlimited)
    pub standard_trade_limit: u64,

    /// Maximum trade amount for Enhanced KYC (0 = unlimited)
    pub enhanced_trade_limit: u64,

    /// Optional ZK verifier program key (Pubkey::default() = disabled)
    pub zk_verifier_key: Pubkey,

    /// Whether this config is active
    pub is_active: bool,

    /// Maximum number of hops allowed in a route
    pub max_route_hops: u8,

    /// Creation timestamp
    pub created_at: i64,

    /// Last updated timestamp
    pub updated_at: i64,

    /// PDA bump
    pub bump: u8,
}

impl ComplianceConfig {
    pub const SEED_PREFIX: &'static [u8] = b"compliance_config";

    /// Check if a jurisdiction is allowed by the bitmask
    pub fn is_jurisdiction_allowed(&self, jurisdiction: &Jurisdiction) -> bool {
        let bit = match jurisdiction {
            Jurisdiction::Japan => 0,
            Jurisdiction::Singapore => 1,
            Jurisdiction::HongKong => 2,
            Jurisdiction::Eu => 3,
            Jurisdiction::Usa => 4,
            Jurisdiction::Other => 5,
        };
        (self.jurisdiction_bitmask >> bit) & 1 == 1
    }

    /// Get trade limit for a given KYC level
    pub fn trade_limit_for_level(&self, level: &KycLevel) -> u64 {
        match level {
            KycLevel::Basic => self.basic_trade_limit,
            KycLevel::Standard => self.standard_trade_limit,
            KycLevel::Enhanced => self.enhanced_trade_limit,
            KycLevel::Institutional => 0, // unlimited
        }
    }
}
