use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self},
};
use spl_token::instruction::AuthorityType;
use crc::crc32;


pub mod account;
pub mod error;
pub mod event;

use crate::account::*;
use crate::error::*;

declare_id!("HohQ7VZFqDDn785ukULBKpNRKHsZXQPtCeUJ9PzYxgZ");

#[program]
mod staking {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        apy_max: u32,
        min_timeframe_in_second: u64,
    ) -> ProgramResult {
        let staking_data = &mut ctx.accounts.staking_data;

        staking_data.initializer = *ctx.accounts.authority.key;
        staking_data.funder_authority = *ctx.accounts.funder_authority.key;
        staking_data.escrow_account = *ctx.accounts.escrow_account.to_account_info().key;
        staking_data.rewarder_account = *ctx.accounts.rewarder_account.to_account_info().key;
        staking_data.mint_address = *ctx.accounts.mint_address.key;

        staking_data.rewarder_balance = 0;
        staking_data.total_funded = 0;
        staking_data.total_reward_paid = 0;

        staking_data.min_timeframe_in_second = min_timeframe_in_second;
        staking_data.timeframe_in_second = 0;
        staking_data.timeframe_started = 0;
        staking_data.pool_reward = 0;
        staking_data.payout_reward = 0;
        staking_data.apy_max = apy_max;    
        staking_data.stakers = Vec::new();

        let (authority, authority_bump) =
            Pubkey::find_program_address(&[STAKING_AUTH_PDA_SEED, staking_data.to_account_info().key.as_ref()], ctx.program_id);
        staking_data.bump_auth = authority_bump;

        token::set_authority(
            ctx.accounts.into_set_escrow_authority_context(),
            AuthorityType::AccountOwner, Some(authority),
        )?;

        token::set_authority(
            ctx.accounts.into_set_rewarder_authority_context(),
            AuthorityType::AccountOwner, Some(authority),
        )?;       

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

        if amount == 0{
            return Err(StakingErrors::AmountMustBigThanZero.into());
        }

        if amount > ctx.accounts.staker_account.amount {
            return Err(StakingErrors::InSufficientBalance.into());             
        }

        let staker_index = ctx.accounts.staking_data.index_of_staker(ctx.accounts.stake_state_account.my_crc);

        if staker_index < 0 && ctx.accounts.staking_data.stakers.len() >= StakingData::MAX_STAKERS {
            return Err(StakingErrors::ReachedMaxStakers.into());
        }

        token::transfer(
            ctx.accounts.into_transfer_to_escrow_context(),
            amount,
        )?;
        
        //update staking data
        ctx.accounts.staking_data.total_staked = ctx.accounts.staking_data.total_staked + amount;

        //update staking state
        let now_ts = Clock::get()?.unix_timestamp as u64;
        ctx.accounts.stake_state_account.total_staked = ctx.accounts.stake_state_account.total_staked + amount;
        ctx.accounts.stake_state_account.last_staked = now_ts;
        ctx.accounts.stake_state_account.add_history(now_ts, 0, amount);

        if staker_index < 0{            
            let new_staker = StakerState {
                staker_crc: ctx.accounts.stake_state_account.my_crc,
                staked_time: now_ts,
                staked_amount: ctx.accounts.stake_state_account.total_staked,
                gained_reward: 0
            };
            ctx.accounts.staking_data.stakers.push(new_staker);
        }else {
            let staker = ctx.accounts.staking_data.stakers.get_mut(staker_index as usize).unwrap();
            staker.staked_time = now_ts;
            staker.staked_amount = ctx.accounts.stake_state_account.total_staked;
        }
        Ok(())
    }


    pub fn unstaking(ctx: Context<Unstaking>, amount: u64) -> ProgramResult {

        if amount == 0{
            return Err(StakingErrors::AmountMustBigThanZero.into());
        }

        let staker_index = ctx.accounts.staking_data.index_of_staker(ctx.accounts.stake_state_account.my_crc);
        if staker_index < 0 {
            return Err(StakingErrors::InvalidStakingStateAccountCantFindEntry.into());
        }

        if amount > ctx.accounts.stake_state_account.total_staked {
            return Err(StakingErrors::InSufficientStakedBalance.into());            
        }

        if amount > ctx.accounts.staking_data.total_staked {
            return Err(StakingErrors::InSufficientEscrowBalance.into());
        }        

        let staker_data = ctx.accounts.staking_data.stakers.get(staker_index as usize).unwrap();   
        if staker_data.gained_reward > 0 {
            return Err(StakingErrors::ExistUnClaimedReward.into());
        }

        let authority_seeds = &[&STAKING_AUTH_PDA_SEED[..], ctx.accounts.staking_data.to_account_info().key.as_ref(), &[ctx.accounts.staking_data.bump_auth]];
        token::transfer(
            ctx.accounts
                .into_transfer_to_staker_context()
                .with_signer(&[&authority_seeds[..]]),
                amount,
        )?;

        //update staking data
        //let staking_data = &mut ctx.accounts.staking_data;        
        ctx.accounts.staking_data.total_staked = ctx.accounts.staking_data.total_staked - amount;

        //update staker state        
        let staker = ctx.accounts.staking_data.stakers.get_mut(staker_index as usize).unwrap();        
        if staker.staked_amount == amount{ 
            //unstaking all, remove entry            
            ctx.accounts.staking_data.stakers.remove(staker_index as usize);
        }else{
            staker.staked_amount = staker.staked_amount - amount;
        }

        //update staking state
        ctx.accounts.stake_state_account.total_staked = ctx.accounts.stake_state_account.total_staked - amount;
        let now_ts = Clock::get()?.unix_timestamp as u64;
        ctx.accounts.stake_state_account.add_history(now_ts, 1, amount);
        Ok(())
    }

    pub fn claim_reward(ctx: Context<Claiming>, amount: u64) -> ProgramResult {

        if amount == 0{
            return Err(StakingErrors::AmountMustBigThanZero.into());
        }

        let staker_index = ctx.accounts.staking_data.index_of_staker(ctx.accounts.stake_state_account.my_crc);

        if staker_index < 0 {
            return Err(StakingErrors::InvalidStakingStateAccountCantFindEntry.into());
        }

        let staker_data = ctx.accounts.staking_data.stakers.get(staker_index as usize).unwrap();

        if amount > staker_data.gained_reward {
            return Err(StakingErrors::InSufficientGainedReward.into());            
        }

        if amount > ctx.accounts.staking_data.payout_reward {
            return Err(StakingErrors::InSufficientRewarderBalance.into());
        }        

        let authority_seeds = &[&STAKING_AUTH_PDA_SEED[..], ctx.accounts.staking_data.to_account_info().key.as_ref(), &[ctx.accounts.staking_data.bump_auth]];
        token::transfer(
            ctx.accounts
                .into_transfer_to_claimer_context()
                .with_signer(&[&authority_seeds[..]]),
                amount,
        )?;

        //update staking data
        //let staking_data = &mut ctx.accounts.staking_data;
        ctx.accounts.staking_data.payout_reward = ctx.accounts.staking_data.payout_reward - amount;
        ctx.accounts.staking_data.total_reward_paid = ctx.accounts.staking_data.total_reward_paid + amount;

        //update staker state        
        let staker = ctx.accounts.staking_data.stakers.get_mut(staker_index as usize).unwrap();        
        staker.gained_reward = staker.gained_reward - amount;                

        //update staking state
        ctx.accounts.stake_state_account.total_rewarded = ctx.accounts.stake_state_account.total_rewarded + amount;
        let now_ts = Clock::get()?.unix_timestamp as u64;
        ctx.accounts.stake_state_account.last_rewarded = now_ts;
        ctx.accounts.stake_state_account.add_history(now_ts, 2, amount);
        Ok(())
    }


    pub fn funding(ctx: Context<Funding>, amount: u64, timeframe_in_second: u64) -> ProgramResult {
        let total_staked = ctx.accounts.staking_data.total_staked;
        let apy_max = ctx.accounts.staking_data.apy_max;
        let now_ts = Clock::get()?.unix_timestamp as u64;
        let mut total_reward: u64 = 0;
        let timeframe_started = ctx.accounts.staking_data.timeframe_started;
        let timeframe = ctx.accounts.staking_data.timeframe_in_second;
        let pool_reward = ctx.accounts.staking_data.pool_reward;

        if amount == 0{
            return Err(StakingErrors::AmountMustBigThanZero.into());
        }

        if timeframe_in_second < ctx.accounts.staking_data.min_timeframe_in_second{
            return Err(StakingErrors::TimeframeMustBigThanMin.into());
        }

        let mut pool_rest = ctx.accounts.staking_data.pool_reward;
        //calc reward
        if timeframe > 0{
            let mut frame_end_time = ctx.accounts.staking_data.timeframe_started + timeframe;
            if now_ts < frame_end_time {
                frame_end_time = now_ts;
            }
            
            for i in 0..ctx.accounts.staking_data.stakers.len(){
                let staker = ctx.accounts.staking_data.stakers.get_mut(i).unwrap();
                if staker.staked_amount == 0 || staker.staked_time >= frame_end_time{
                    continue;
                }

                let mut seconds = timeframe;
                if staker.staked_time > timeframe_started {
                    seconds = frame_end_time - staker.staked_time;
                }
                let days: f64 = (seconds as f64)/ ((3600 * 24) as f64);
                let frame_days: f64 = (timeframe as f64) / ((3600 * 24) as f64);
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
            pool_rest = ctx.accounts.staking_data.pool_reward - total_reward;
        }

        let real_fund_amount = amount - pool_rest;
        if real_fund_amount > ctx.accounts.funder_account.amount {
            return Err(StakingErrors::InSufficientBalance.into());             
        }

        token::transfer(
            ctx.accounts.into_transfer_to_rewarder_context(),
            amount,
        )?;
        ctx.accounts.staking_data.payout_reward = ctx.accounts.staking_data.payout_reward + total_reward;
        ctx.accounts.staking_data.pool_reward = pool_rest + real_fund_amount;
        ctx.accounts.staking_data.total_funded = ctx.accounts.staking_data.total_funded + real_fund_amount;
        ctx.accounts.staking_data.rewarder_balance = ctx.accounts.staking_data.rewarder_balance + real_fund_amount;
        ctx.accounts.staking_data.timeframe_in_second = timeframe_in_second;
        ctx.accounts.staking_data.timeframe_started = now_ts;
        Ok(())
    }

    pub fn set_max_apy(ctx: Context<SetMaxApy>, apy_max: u32) -> ProgramResult {
        ctx.accounts.staking_data.apy_max = apy_max;
        Ok(())
    }
}
