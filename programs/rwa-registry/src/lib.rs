//! RWA Registry for Tokenized Real-World Assets
//!
//!

//! Supports tokenization of:
//! - Securities (equities, bonds)
//! - Real estate
//! - Commodities
//! - Equipment and machinery
//! - IP and royalties

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, MintTo, Burn};

declare_id!("BMej5CMvLs8xN3TGj7o9HKV2px6gyycS26y5ZJSBjL5D");

#[error_code]
pub enum RwaError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Asset is not active")]
    AssetNotActive,

    #[msg("Asset is frozen")]
    AssetFrozen,

    #[msg("Invalid ownership proof")]
    InvalidOwnershipProof,

    #[msg("Custody verification required")]
    CustodyVerificationRequired,

    #[msg("Dividend not available")]
    DividendNotAvailable,
}

#[program]
pub mod rwa_registry {
    use super::*;

    /// Register a new RWA for tokenization
    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        params: RegisterAssetParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        asset.authority = ctx.accounts.authority.key();
        asset.custodian = params.custodian;
        asset.asset_type = params.asset_type;
        asset.token_mint = ctx.accounts.token_mint.key();
        asset.total_supply = 0;
        asset.valuation = params.valuation;
        asset.valuation_currency = params.valuation_currency;
        asset.name = params.name;
        let symbol = params.symbol;
        asset.symbol = symbol.clone();
        asset.isin = params.isin;
        asset.jurisdiction = params.jurisdiction;
        asset.legal_document_hash = params.legal_document_hash;
        asset.custody_proof_hash = [0u8; 32];
        asset.status = AssetStatus::Pending;
        asset.is_frozen = false;
        asset.last_audit = clock.unix_timestamp;
        asset.created_at = clock.unix_timestamp;
        asset.bump = ctx.bumps.asset;

        emit!(AssetRegistered {
            asset: asset.key(),
            asset_type: params.asset_type,
            symbol,
            valuation: params.valuation,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Verify custody and activate asset for tokenization
    pub fn verify_custody(
        ctx: Context<VerifyCustody>,
        custody_proof_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        asset.custody_proof_hash = custody_proof_hash;
        asset.status = AssetStatus::Active;
        asset.last_audit = clock.unix_timestamp;

        emit!(CustodyVerified {
            asset: asset.key(),
            custodian: asset.custodian,
            proof_hash: custody_proof_hash,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Mint tokens representing ownership of the RWA
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        require!(
            matches!(asset.status, AssetStatus::Active),
            RwaError::AssetNotActive
        );
        require!(!asset.is_frozen, RwaError::AssetFrozen);

        // Mint tokens
        let asset_key = asset.key();
        let seeds = &[b"asset".as_ref(), asset.symbol.as_bytes(), &[asset.bump]];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(),
                    authority: asset.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        asset.total_supply = asset.total_supply.saturating_add(amount);

        // Create ownership proof
        let proof = &mut ctx.accounts.ownership_proof;
        proof.asset = asset.key();
        proof.owner = recipient;
        proof.amount = amount;
        proof.acquisition_price = asset.valuation * amount / asset.total_supply.max(1);
        proof.acquired_at = clock.unix_timestamp;
        proof.is_active = true;
        proof.bump = ctx.bumps.ownership_proof;

        emit!(TokensMinted {
            asset: asset.key(),
            recipient,
            amount,
            total_supply: asset.total_supply,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Update asset valuation
    pub fn update_valuation(
        ctx: Context<UpdateValuation>,
        new_valuation: u64,
        valuation_proof_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        let old_valuation = asset.valuation;
        asset.valuation = new_valuation;
        asset.last_audit = clock.unix_timestamp;

        emit!(ValuationUpdated {
            asset: asset.key(),
            old_valuation,
            new_valuation,
            proof_hash: valuation_proof_hash,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Record dividend distribution
    pub fn distribute_dividend(
        ctx: Context<DistributeDividend>,
        params: DividendParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let dividend = &mut ctx.accounts.dividend;

        dividend.asset = ctx.accounts.asset.key();
        dividend.amount_per_token = params.amount_per_token;
        dividend.total_amount = params.total_amount;
        dividend.payment_token = params.payment_token;
        dividend.record_date = params.record_date;
        dividend.payment_date = params.payment_date;
        dividend.status = if params.payment_date <= clock.unix_timestamp {
            DividendStatus::Payable
        } else {
            DividendStatus::Announced
        };
        dividend.claimed_amount = 0;
        dividend.created_at = clock.unix_timestamp;
        dividend.bump = ctx.bumps.dividend;

        emit!(DividendAnnounced {
            asset: ctx.accounts.asset.key(),
            dividend: dividend.key(),
            amount_per_token: params.amount_per_token,
            record_date: params.record_date,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Claim dividend
    pub fn claim_dividend(ctx: Context<ClaimDividend>) -> Result<()> {
        let clock = Clock::get()?;
        let dividend = &mut ctx.accounts.dividend;
        let ownership = &ctx.accounts.ownership_proof;

        require!(
            matches!(dividend.status, DividendStatus::Payable),
            RwaError::DividendNotAvailable
        );
        require!(ownership.is_active, RwaError::InvalidOwnershipProof);

        // Calculate claimable amount
        let claimable = (ownership.amount as u128 * dividend.amount_per_token as u128
            / 1_000_000) as u64;

        dividend.claimed_amount = dividend.claimed_amount.checked_add(claimable).unwrap();

        // Transfer dividend (implementation would use SPL token transfer)
        // For now, just emit event

        emit!(DividendClaimed {
            dividend: dividend.key(),
            owner: ctx.accounts.owner.key(),
            amount: claimable,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Freeze asset (regulatory action)
    pub fn freeze_asset(ctx: Context<FreezeAsset>) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        asset.is_frozen = true;

        emit!(AssetFrozen {
            asset: asset.key(),
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Unfreeze asset
    pub fn unfreeze_asset(ctx: Context<FreezeAsset>) -> Result<()> {
        let clock = Clock::get()?;
        let asset = &mut ctx.accounts.asset;

        asset.is_frozen = false;

        emit!(AssetUnfrozen {
            asset: asset.key(),
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// State structures

#[account]
#[derive(InitSpace)]
pub struct RwaAsset {
    /// Asset authority (issuer)
    pub authority: Pubkey,

    /// Custodian holding the underlying asset
    pub custodian: Pubkey,

    /// Type of asset
    pub asset_type: RwaAssetType,

    /// Token mint representing ownership
    pub token_mint: Pubkey,

    /// Total token supply
    pub total_supply: u64,

    /// Current valuation (in valuation_currency smallest unit)
    pub valuation: u64,

    /// Valuation currency
    pub valuation_currency: Currency,

    /// Asset name
    #[max_len(50)]
    pub name: String,

    /// Trading symbol
    #[max_len(10)]
    pub symbol: String,

    /// ISIN (if applicable)
    pub isin: Option<[u8; 12]>,

    /// Legal jurisdiction
    pub jurisdiction: Jurisdiction,

    /// Hash of legal documentation
    pub legal_document_hash: [u8; 32],

    /// Hash of custody proof
    pub custody_proof_hash: [u8; 32],

    /// Asset status
    pub status: AssetStatus,

    /// Is asset frozen
    pub is_frozen: bool,

    /// Last audit timestamp
    pub last_audit: i64,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl RwaAsset {
    pub const SEED_PREFIX: &'static [u8] = b"asset";
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RwaAssetType {
    /// Tokenized equity (stocks)
    Equity,
    /// Tokenized bonds
    Bond,
    /// Real estate
    RealEstate,
    /// Commodity
    Commodity,
    /// Equipment
    Equipment,
    /// Intellectual property / royalties
    IntellectualProperty,
    /// Fund units
    Fund,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Currency {
    Jpy,
    Usd,
    Eur,
    Sgd,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Jurisdiction {
    Japan,
    Singapore,
    HongKong,
    Usa,
    Eu,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AssetStatus {
    /// Pending custody verification
    Pending,
    /// Active and tradeable
    Active,
    /// Suspended
    Suspended,
    /// Delisted
    Delisted,
}

#[account]
#[derive(InitSpace)]
pub struct OwnershipProof {
    /// Associated asset
    pub asset: Pubkey,

    /// Current owner
    pub owner: Pubkey,

    /// Token amount held
    pub amount: u64,

    /// Acquisition price
    pub acquisition_price: u64,

    /// Acquired timestamp
    pub acquired_at: i64,

    /// Is proof active
    pub is_active: bool,

    /// Bump seed
    pub bump: u8,
}

impl OwnershipProof {
    pub const SEED_PREFIX: &'static [u8] = b"ownership";
}

#[account]
#[derive(InitSpace)]
pub struct Dividend {
    /// Associated asset
    pub asset: Pubkey,

    /// Amount per token (scaled by 1e6)
    pub amount_per_token: u64,

    /// Total dividend amount
    pub total_amount: u64,

    /// Payment token (stablecoin)
    pub payment_token: Pubkey,

    /// Record date
    pub record_date: i64,

    /// Payment date
    pub payment_date: i64,

    /// Dividend status
    pub status: DividendStatus,

    /// Total claimed amount
    pub claimed_amount: u64,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl Dividend {
    pub const SEED_PREFIX: &'static [u8] = b"dividend";
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DividendStatus {
    Announced,
    Payable,
    Completed,
    Cancelled,
}

// Account contexts

#[derive(Accounts)]
#[instruction(params: RegisterAssetParams)]
pub struct RegisterAsset<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + RwaAsset::INIT_SPACE,
        seeds = [RwaAsset::SEED_PREFIX, params.symbol.as_bytes()],
        bump
    )]
    pub asset: Account<'info, RwaAsset>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = asset,
    )]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterAssetParams {
    pub custodian: Pubkey,
    pub asset_type: RwaAssetType,
    pub valuation: u64,
    pub valuation_currency: Currency,
    pub name: String,
    pub symbol: String,
    pub isin: Option<[u8; 12]>,
    pub jurisdiction: Jurisdiction,
    pub legal_document_hash: [u8; 32],
}

#[derive(Accounts)]
pub struct VerifyCustody<'info> {
    #[account(
        constraint = custodian.key() == asset.custodian @ RwaError::Unauthorized
    )]
    pub custodian: Signer<'info>,

    #[account(mut)]
    pub asset: Account<'info, RwaAsset>,
}

#[derive(Accounts)]
#[instruction(amount: u64, recipient: Pubkey)]
pub struct MintTokens<'info> {
    #[account(
        mut,
        constraint = authority.key() == asset.authority @ RwaError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub asset: Account<'info, RwaAsset>,

    #[account(
        mut,
        constraint = token_mint.key() == asset.token_mint
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub recipient_token: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + OwnershipProof::INIT_SPACE,
        seeds = [OwnershipProof::SEED_PREFIX, asset.key().as_ref(), recipient.as_ref()],
        bump
    )]
    pub ownership_proof: Account<'info, OwnershipProof>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateValuation<'info> {
    #[account(
        constraint = authority.key() == asset.authority @ RwaError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub asset: Account<'info, RwaAsset>,
}

#[derive(Accounts)]
#[instruction(params: DividendParams)]
pub struct DistributeDividend<'info> {
    #[account(
        mut,
        constraint = authority.key() == asset.authority @ RwaError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub asset: Account<'info, RwaAsset>,

    #[account(
        init,
        payer = authority,
        space = 8 + Dividend::INIT_SPACE,
        seeds = [Dividend::SEED_PREFIX, asset.key().as_ref(), &params.record_date.to_le_bytes()],
        bump
    )]
    pub dividend: Account<'info, Dividend>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DividendParams {
    pub amount_per_token: u64,
    pub total_amount: u64,
    pub payment_token: Pubkey,
    pub record_date: i64,
    pub payment_date: i64,
}

#[derive(Accounts)]
pub struct ClaimDividend<'info> {
    pub owner: Signer<'info>,

    pub asset: Account<'info, RwaAsset>,

    #[account(
        seeds = [OwnershipProof::SEED_PREFIX, asset.key().as_ref(), owner.key().as_ref()],
        bump = ownership_proof.bump
    )]
    pub ownership_proof: Account<'info, OwnershipProof>,

    #[account(
        mut,
        seeds = [Dividend::SEED_PREFIX, asset.key().as_ref(), &dividend.record_date.to_le_bytes()],
        bump = dividend.bump
    )]
    pub dividend: Account<'info, Dividend>,
}

#[derive(Accounts)]
pub struct FreezeAsset<'info> {
    #[account(
        constraint = authority.key() == asset.authority @ RwaError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub asset: Account<'info, RwaAsset>,
}

// Events

#[event]
pub struct AssetRegistered {
    pub asset: Pubkey,
    pub asset_type: RwaAssetType,
    pub symbol: String,
    pub valuation: u64,
    pub timestamp: i64,
}

#[event]
pub struct CustodyVerified {
    pub asset: Pubkey,
    pub custodian: Pubkey,
    pub proof_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub asset: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct ValuationUpdated {
    pub asset: Pubkey,
    pub old_valuation: u64,
    pub new_valuation: u64,
    pub proof_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct DividendAnnounced {
    pub asset: Pubkey,
    pub dividend: Pubkey,
    pub amount_per_token: u64,
    pub record_date: i64,
    pub timestamp: i64,
}

#[event]
pub struct DividendClaimed {
    pub dividend: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AssetFrozen {
    pub asset: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AssetUnfrozen {
    pub asset: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}
