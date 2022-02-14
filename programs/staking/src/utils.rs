use crate::account::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Transfer;


pub const SAKING_PDA_SEED: &[u8] = b"ser_staking";

pub fn transfer_spl<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    staking_account: &ProgramAccount<'info, StakingData>,
) -> ProgramResult {
    let cpi_accounts = Transfer {
        from: from.clone(),
        to: to.clone(),
        authority: authority.clone(),
    };

    let cpi_ctx = CpiContext::new(token_program.clone(), cpi_accounts);
    let seeds = &[
        &SAKING_PDA_SEED[..],
        &staking_account.mint_address.as_ref()[..],
        &staking_account.to_account_info().key.as_ref()[..],
        &[staking_account.bump_seed],
    ];
    anchor_spl::token::transfer(cpi_ctx.with_signer(&[&seeds[..]]), amount)?;

    Ok(())
}

