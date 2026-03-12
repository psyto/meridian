use anchor_lang::prelude::*;

use crate::errors::ZkVerifierError;
use crate::state::*;

#[derive(Accounts)]
pub struct CheckAttestation<'info> {
    /// The wallet whose attestation is being checked
    /// CHECK: This is just a pubkey reference for the PDA seed, not a signer
    pub wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [ComplianceAttestation::SEED_PREFIX, wallet.key().as_ref()],
        bump = attestation.bump,
    )]
    pub attestation: Account<'info, ComplianceAttestation>,
}

pub fn handler(ctx: Context<CheckAttestation>) -> Result<()> {
    let clock = Clock::get()?;
    let attestation = &ctx.accounts.attestation;

    // Check if attestation has been revoked
    require!(attestation.is_valid, ZkVerifierError::AttestationRevoked);

    // Check if attestation has expired
    require!(
        attestation.expires_at > clock.unix_timestamp,
        ZkVerifierError::AttestationExpired
    );

    emit!(AttestationChecked {
        wallet: ctx.accounts.wallet.key(),
        is_valid: true,
        expires_at: attestation.expires_at,
    });

    Ok(())
}

#[event]
pub struct AttestationChecked {
    pub wallet: Pubkey,
    pub is_valid: bool,
    pub expires_at: i64,
}
