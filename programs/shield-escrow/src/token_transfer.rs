use anchor_lang::prelude::*;

/// `transfer_checked` CPI that also works for mints with a transfer hook.
///
/// `extra_accounts` are the instruction's remaining accounts. For a hooked
/// mint the client passes the hook program, its extra-account-metas PDA and
/// the accounts that list resolves to; Token-2022's on-chain helper picks the
/// ones each transfer needs. For mints without a hook it may be empty.
#[allow(clippy::too_many_arguments)]
pub fn transfer_checked_with_hook<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    extra_accounts: &[AccountInfo<'info>],
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    spl_token_2022::onchain::invoke_transfer_checked(
        token_program.key,
        from.clone(),
        mint.clone(),
        to.clone(),
        authority.clone(),
        extra_accounts,
        amount,
        decimals,
        signer_seeds,
    )
    .map_err(Into::into)
}
