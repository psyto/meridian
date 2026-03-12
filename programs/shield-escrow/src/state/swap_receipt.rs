use anchor_lang::prelude::*;

/// Receipt tracking the lifecycle of a single swap through the escrow.
///
/// Created on deposit, updated on swap execution, consumed on withdrawal or refund.
#[account]
#[derive(InitSpace)]
pub struct SwapReceipt {
    /// The trader who initiated the swap
    pub trader: Pubkey,

    /// Input token mint
    pub input_mint: Pubkey,

    /// Output token mint
    pub output_mint: Pubkey,

    /// Amount deposited by the trader
    pub input_amount: u64,

    /// Amount received after swap (set on execute_swap)
    pub output_amount: u64,

    /// Protocol fee taken (set on execute_swap)
    pub fee_amount: u64,

    /// Current status of the swap
    pub status: SwapStatus,

    /// Unique nonce per trader (used in PDA derivation)
    pub nonce: u64,

    /// Creation timestamp
    pub created_at: i64,

    /// Completion timestamp
    pub completed_at: Option<i64>,

    /// Bump seed for the receipt PDA
    pub bump: u8,
}

impl SwapReceipt {
    pub const SEED_PREFIX: &'static [u8] = b"receipt";
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SwapStatus {
    /// Tokens deposited, awaiting swap execution
    Pending,
    /// Swap executed, awaiting withdrawal
    Completed,
    /// Swap failed, input tokens refunded
    Refunded,
}
