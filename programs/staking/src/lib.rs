use anchor_lang::prelude::*;

pub mod account;
pub mod error;
pub mod event;
pub mod utils;

use crate::account::*;
use crate::error::*;
use crate::event::*;
use crate::utils::*;

declare_id!("DauurS9F1fswgikQeCqWAzTpMAg1hKXRUcfUMMvoZxsB");

#[program]
mod tokenlock {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        reward_percent: u8,
        reward_period_in_sec: u32,
        bump_seed: u8,
    ) -> ProgramResult {
        let staking_account = &mut ctx.accounts.staking_account;

        if max_release_delay < 1 {
            return Err(TokenlockErrors::MaxReleaseDelayLessThanOne.into());
        }

        staking_account.escrow_account = *ctx.accounts.escrow_account.to_account_info().key;
        staking_account.mint_address = *ctx.accounts.mint_address.key;

        staking_account.reward_percent = reward_percent;
        staking_account.reward_period_in_sec = reward_period_in_sec;
        staking_account.bump_seed = bump_seed;
        Ok(())
    }

    pub fn initialize_stake_state(
        ctx: Context<InitializeStakeState>
    ) -> ProgramResult {

        let staking_account = &ctx.accounts.staking_account;
        let stake_state_account = &mut ctx.accounts.stake_state_account;

        stake_state_account.staking_account = *ctx.accounts.staking_account.to_account_info().key;
        stake_state_account.mint_address = *staking_account.mint_address;
        stake_state_account.onwer_address = *ctx.accounts.authority.key;
        stake_state_account.total_staked = 0;
        stake_state_account.total_rewarded = 0;
        stake_state_account.last_staked = 0;
        stake_state_account.last_rewarded = 0;
        Ok(())
    }

    
}
