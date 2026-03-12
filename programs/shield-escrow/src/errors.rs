use anchor_lang::prelude::*;

#[error_code]
pub enum ShieldError {
    #[msg("Shield escrow is not active")]
    ShieldNotActive,

    #[msg("Swap receipt is not in Pending status")]
    SwapNotPending,

    #[msg("Swap receipt is not in Completed status")]
    SwapNotCompleted,

    #[msg("Invalid swap amount: output must be greater than zero")]
    InvalidSwapAmount,

    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    #[msg("Fee exceeds maximum of 100 basis points (1%)")]
    FeeTooHigh,

    #[msg("Swap output is below the minimum required")]
    InsufficientOutput,
}
