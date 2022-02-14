use anchor_lang::prelude::*;

pub mod account;
pub mod error;
pub mod event;
pub mod utils;

use crate::account::*;

declare_id!("HohQ7VZFqDDn785ukULBKpNRKHsZXQPtCeUJ9PzYxgZ");

#[program]
mod staking {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        reward_percent: u8,
        reward_period_in_sec: u32,
        bump_seed: u8,
    ) -> ProgramResult {
        let staking_account = &mut ctx.accounts.staking_account;

        // if max_release_delay < 1 {
        //     return Err(StakingErrors::MaxReleaseDelayLessThanOne.into());
        // }

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
        stake_state_account.mint_address = staking_account.mint_address;
        stake_state_account.onwer_address = *ctx.accounts.authority.key;
        stake_state_account.total_staked = 0;
        stake_state_account.total_rewarded = 0;
        stake_state_account.last_staked = 0;
        stake_state_account.last_rewarded = 0;
        Ok(())
    }

    pub fn staking(
        ctx: Context<Staking>,
        amount: u64
    ) -> ProgramResult {

        let staking_account = &mut ctx.accounts.staking_account;
        let stake_state_account = &mut ctx.accounts.stake_state_account;

        utils::transfer_spl(&ctx.accounts.staker_account.to_account_info(), 
            &ctx.accounts.escrow_account.to_account_info(), 
            &ctx.accounts.authority,
            &ctx.accounts.token_program, amount, staking_account)?;

        //update staking data
        staking_account.total_staked = staking_account.total_staked + amount;

        //update staking state
        let now_ts = Clock::get()?.unix_timestamp as u64;             
        stake_state_account.total_staked = stake_state_account.total_staked + amount;
        stake_state_account.last_staked = now_ts;
        Ok(())
    }
}
