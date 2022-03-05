use anchor_lang::prelude::*;
use crc::crc32;

pub mod account;
pub mod error;
pub mod event;
pub mod utils;

use crate::account::*;
use crate::error::*;

declare_id!("HohQ7VZFqDDn785ukULBKpNRKHsZXQPtCeUJ9PzYxgZ");

#[program]
mod staking {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        apy_max: u32,
        bump_seed: u8,
        bump_seed1: u8,
    ) -> ProgramResult {
        let staking_data = &mut ctx.accounts.staking_data;

        staking_data.escrow_account = *ctx.accounts.escrow_account.to_account_info().key;
        staking_data.rewarder_account = *ctx.accounts.rewarder_account.to_account_info().key;
        staking_data.mint_address = *ctx.accounts.mint_address.key;

        staking_data.rewarder_balance = 0;
        staking_data.total_funded = 0;
        staking_data.total_reward_paid = 0;
    
        staking_data.bump_seed = bump_seed;
        staking_data.bump_seed_reward = bump_seed1;

        staking_data.timeframe_in_second = 0;
        staking_data.timeframe_started = 0;
        staking_data.pool_reward = 0;
        staking_data.payout_reward = 0;
        staking_data.apy_max = apy_max;    
        staking_data.stakers = Vec::new();
        Ok(())
    }

    pub fn initialize_stake_state(
        ctx: Context<InitializeStakeState>
    ) -> ProgramResult {

        let staking_data = &ctx.accounts.staking_data;
        let stake_state_account = &mut ctx.accounts.stake_state_account;

        
        stake_state_account.staking_account = *ctx.accounts.staking_data.to_account_info().key;
        stake_state_account.my_crc = crc32::checksum_ieee(stake_state_account.to_account_info().key.as_ref());
        stake_state_account.mint_address = staking_data.mint_address;
        stake_state_account.onwer_address = *ctx.accounts.authority.key;
        stake_state_account.total_staked = 0;
        stake_state_account.total_rewarded = 0;
        stake_state_account.last_staked = 0;
        stake_state_account.last_rewarded = 0;
        stake_state_account.history = vec![];
        Ok(())
    }

    pub fn staking(ctx: Context<Staking>,amount: u64) -> ProgramResult {

        if amount > ctx.accounts.staker_account.amount {
            return Err(StakingErrors::InSufficientBalance.into());             
        }

        let staking_data = &mut ctx.accounts.staking_data;
        let stake_state_account = &mut ctx.accounts.stake_state_account;
        let staker_index = staking_data.index_of_staker(stake_state_account.my_crc);

        if staker_index < 0 && staking_data.stakers.len() >= StakingData::MAX_STAKERS {
            return Err(StakingErrors::ReachedMaxStakers.into());
        }

        utils::transfer_spl(&ctx.accounts.staker_account.to_account_info(), 
            &ctx.accounts.escrow_account.to_account_info(), 
            &ctx.accounts.authority,
            &ctx.accounts.token_program, amount, staking_data)?;

        //update staking data
        staking_data.total_staked = staking_data.total_staked + amount;

        //update staking state
        let now_ts = Clock::get()?.unix_timestamp as u64;
        stake_state_account.total_staked = stake_state_account.total_staked + amount;
        stake_state_account.last_staked = now_ts;
        stake_state_account.add_history(now_ts, 0, amount);

        if staker_index < 0{            
            let new_staker = StakerState {
                staker_crc: stake_state_account.my_crc,
                staked_time: now_ts,
                staked_amount: stake_state_account.total_staked,
                gained_reward: 0
            };
            staking_data.stakers.push(new_staker);
        }else {
            let staker = staking_data.stakers.get_mut(staker_index as usize).unwrap();
            staker.staked_time = now_ts;
            staker.staked_amount = stake_state_account.total_staked;
        }
        Ok(())
    }


    pub fn unstaking(ctx: Context<Unstaking>, amount: u64) -> ProgramResult {

        let staking_data = &mut ctx.accounts.staking_data;
        let stake_state_account = &mut ctx.accounts.stake_state_account;
        let staker_index = staking_data.index_of_staker(stake_state_account.my_crc);
        if staker_index < 0 {
            return Err(StakingErrors::InvalidStakingStateAccountCantFindEntry.into());
        }

        if amount > stake_state_account.total_staked {
            return Err(StakingErrors::InSufficientStakedBalance.into());            
        }

        if amount > staking_data.total_staked {
            return Err(StakingErrors::InSufficientEscrowBalance.into());
        }        

        utils::transfer_spl(&ctx.accounts.escrow_account.to_account_info(), 
            &ctx.accounts.reclaimer.to_account_info(), 
            &ctx.accounts.pda_account.to_account_info(),
            &ctx.accounts.token_program, amount, staking_data)?;

        //update staking data
        //let staking_data = &mut ctx.accounts.staking_data;        
        staking_data.total_staked = staking_data.total_staked - amount;

        //update staker state        
        let staker = staking_data.stakers.get_mut(staker_index as usize).unwrap();        
        if staker.staked_amount == amount{ 
            //unstaking all, remove entry            
            staking_data.stakers.remove(staker_index as usize);
        }else{
            staker.staked_amount = staker.staked_amount - amount;
        }

        //update staking state
        stake_state_account.total_staked = stake_state_account.total_staked - amount;
        let now_ts = Clock::get()?.unix_timestamp as u64;
        stake_state_account.add_history(now_ts, 1, amount);
        Ok(())
    }


    pub fn funding(ctx: Context<Funding>, amount: u64, timeframe_in_second: u64) -> ProgramResult {
        let staking_data = &mut ctx.accounts.staking_data;
        let total_staked = staking_data.total_staked;
        let apy_max = staking_data.apy_max;
        let now_ts = Clock::get()?.unix_timestamp as u64;
        let mut pool_rest: u64 = 0;
        let mut total_reward: u64 = 0;
        let timeframe_started = staking_data.timeframe_started;
        let timeframe = staking_data.timeframe_in_second;
        let pool_reward = staking_data.pool_reward;

        //calc reward
        if timeframe > 0{
            let mut frame_end_time = staking_data.timeframe_started + timeframe;
            if now_ts < frame_end_time {
                frame_end_time = now_ts;
            }
            
            for i in 0..staking_data.stakers.len(){
                let staker = staking_data.stakers.get_mut(i).unwrap();
                if staker.staked_amount == 0 || staker.staked_time >= frame_end_time{
                    continue;
                }

                let mut seconds = timeframe;
                if staker.staked_time > timeframe_started {
                    seconds = frame_end_time - staker.staked_time;
                }
                let days: f64 = (seconds as f64)/ ((3600 * 24) as f64);
                let frame_days: f64 = (seconds as f64) / ((3600 * 24) as f64);
                let gained_total: f64 = (pool_reward as f64) * days * (staker.staked_amount as f64)/ (frame_days * total_staked as f64);
                let gained_per_day: f64 = gained_total / days;
                let staked_per_day: f64 = (staker.staked_amount as f64) / days;
                let mut gained_percent_per_day: f64 = gained_per_day * 100.00 / staked_per_day;
                let apd_max = (apy_max as f64) / 365.50;

                if gained_percent_per_day > apd_max{
                    gained_percent_per_day = apd_max;
                }

                let gained = (gained_percent_per_day * staked_per_day * days / 100.00) as u64;

                staker.gained_reward = staker.gained_reward + gained;
                total_reward = total_reward + gained;
            }

            staking_data.total_reward_paid = staking_data.total_reward_paid + total_reward;
            staking_data.payout_reward = staking_data.payout_reward + total_reward;

            pool_rest = staking_data.pool_reward - total_reward;
        }

        let real_fund_amount = amount - pool_rest;
        if real_fund_amount > ctx.accounts.funder_account.amount {
            return Err(StakingErrors::InSufficientBalance.into());             
        }
        

        utils::transfer_spl(&ctx.accounts.funder_account.to_account_info(), 
            &ctx.accounts.rewarder_account.to_account_info(), 
            &ctx.accounts.authority,
            &ctx.accounts.token_program, real_fund_amount, staking_data)?;
    
        staking_data.payout_reward = staking_data.payout_reward + total_reward;
        staking_data.pool_reward = pool_rest + real_fund_amount;
        staking_data.total_funded = staking_data.total_funded + real_fund_amount;
        staking_data.rewarder_balance = staking_data.rewarder_balance + real_fund_amount;
        staking_data.timeframe_in_second = timeframe_in_second;
        staking_data.timeframe_started = now_ts;
        Ok(())
    }
}
