use anchor_lang::prelude::*;

/// AMM liquidity pool for securities trading
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Associated market
    pub market: Pubkey,

    /// Security token liquidity
    pub security_liquidity: u64,

    /// Quote (JPY) liquidity
    pub quote_liquidity: u64,

    /// LP token mint
    pub lp_mint: Pubkey,

    /// Total LP tokens minted
    pub lp_supply: u64,

    /// Pool authority (PDA)
    pub authority: Pubkey,

    /// Security token vault
    pub security_vault: Pubkey,

    /// Quote token vault
    pub quote_vault: Pubkey,

    /// Accumulated fees (security)
    pub accumulated_fees_security: u64,

    /// Accumulated fees (quote)
    pub accumulated_fees_quote: u64,

    /// TWAP (Time-Weighted Average Price) - scaled by 1e6
    pub twap: u64,

    /// Last TWAP update
    pub twap_last_update: i64,

    /// Cumulative price for TWAP calculation
    pub cumulative_price: u128,

    /// K constant for verification (security * quote)
    pub k_last: u128,

    /// Is pool active
    pub is_active: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl Pool {
    pub const SEED_PREFIX: &'static [u8] = b"pool";
    pub const PRICE_PRECISION: u64 = 1_000_000; // 1e6

    /// Calculate current spot price (quote per security)
    pub fn get_spot_price(&self) -> u64 {
        if self.security_liquidity == 0 {
            return 0;
        }
        ((self.quote_liquidity as u128 * Self::PRICE_PRECISION as u128)
            / self.security_liquidity as u128) as u64
    }

    /// Calculate output amount using constant product formula (x * y = k)
    pub fn calculate_swap_output(
        &self,
        input_amount: u64,
        is_security_input: bool,
        fee_bps: u16,
    ) -> Option<(u64, u64)> {
        let (input_reserve, output_reserve) = if is_security_input {
            (self.security_liquidity, self.quote_liquidity)
        } else {
            (self.quote_liquidity, self.security_liquidity)
        };

        if input_reserve == 0 || output_reserve == 0 {
            return None;
        }

        // Apply fee
        let fee = (input_amount as u128 * fee_bps as u128) / 10000;
        let input_with_fee = input_amount as u128 - fee;

        // x * y = k formula
        let numerator = input_with_fee * output_reserve as u128;
        let denominator = input_reserve as u128 + input_with_fee;

        let output = (numerator / denominator) as u64;
        let fee_amount = fee as u64;

        Some((output, fee_amount))
    }

    /// Calculate LP tokens to mint for adding liquidity
    pub fn calculate_lp_tokens(
        &self,
        security_amount: u64,
        quote_amount: u64,
    ) -> Option<u64> {
        if self.lp_supply == 0 {
            // Initial liquidity: sqrt(security * quote)
            let product = security_amount as u128 * quote_amount as u128;
            Some((product as f64).sqrt() as u64)
        } else {
            // Proportional to existing liquidity
            let security_ratio = (security_amount as u128 * self.lp_supply as u128)
                / self.security_liquidity as u128;
            let quote_ratio = (quote_amount as u128 * self.lp_supply as u128)
                / self.quote_liquidity as u128;

            // Use minimum to prevent manipulation
            Some(security_ratio.min(quote_ratio) as u64)
        }
    }

    /// Calculate tokens to return for removing liquidity
    pub fn calculate_withdraw_amounts(&self, lp_amount: u64) -> Option<(u64, u64)> {
        if self.lp_supply == 0 || lp_amount > self.lp_supply {
            return None;
        }

        let security_out = (lp_amount as u128 * self.security_liquidity as u128
            / self.lp_supply as u128) as u64;
        let quote_out = (lp_amount as u128 * self.quote_liquidity as u128
            / self.lp_supply as u128) as u64;

        Some((security_out, quote_out))
    }

    /// Update TWAP with new price observation
    pub fn update_twap(&mut self, current_time: i64) {
        let time_elapsed = current_time - self.twap_last_update;
        if time_elapsed <= 0 || self.security_liquidity == 0 {
            return;
        }

        let current_price = self.get_spot_price();
        self.cumulative_price += current_price as u128 * time_elapsed as u128;
        self.twap = (self.cumulative_price / (current_time - self.created_at) as u128) as u64;
        self.twap_last_update = current_time;
    }

    /// Calculate price impact for a trade
    pub fn calculate_price_impact(&self, input_amount: u64, is_security_input: bool) -> u64 {
        let current_price = self.get_spot_price();
        if current_price == 0 {
            return 0;
        }

        if let Some((output, _)) = self.calculate_swap_output(input_amount, is_security_input, 0) {
            let effective_price = if is_security_input {
                (output as u128 * Self::PRICE_PRECISION as u128 / input_amount as u128) as u64
            } else {
                (input_amount as u128 * Self::PRICE_PRECISION as u128 / output as u128) as u64
            };

            // Price impact in basis points
            if effective_price > current_price {
                ((effective_price - current_price) as u128 * 10000 / current_price as u128) as u64
            } else {
                ((current_price - effective_price) as u128 * 10000 / current_price as u128) as u64
            }
        } else {
            10000 // 100% impact if calculation fails
        }
    }
}
