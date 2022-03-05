use anchor_lang::prelude::*;
//use anchor_lang::solana_program::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StakerState {
    pub staker_crc: u32,
    pub staked_time: u64,
    pub staked_amount: u64,
    pub gained_reward: u64,
}

#[account]
#[derive(Default)]
pub struct StakingData {    
    pub mint_address: Pubkey,
    pub escrow_account: Pubkey,
    pub rewarder_account: Pubkey,
    pub rewarder_balance: u64,
    pub total_funded: u64,
    pub total_reward_paid: u64,

    pub bump_seed: u8,
    pub bump_seed_reward: u8,
    pub total_staked: u64,

    //funding 
    pub timeframe_in_second: u64,
    pub timeframe_started: u64,
    pub pool_reward: u64,
    pub payout_reward: u64,
    pub apy_max: u32,

    //stakers
    pub stakers: Vec<StakerState>
}

impl StakingData{
    pub const MAX_STAKERS: usize = 385;

    pub fn index_of_staker(&self, crc: u32) -> i32{
        for i in 0..self.stakers.len() {
            if crc == self.stakers[i].staker_crc {
                return i as i32;
            }
        }
        return -1;
    }
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 10240)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut)]
    pub authority: AccountInfo<'info>,

    #[account(mut,
        constraint = *escrow_account.to_account_info().owner == *token_program.key,
        constraint = escrow_account.mint == *mint_address.key,
    )]
    pub escrow_account: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut,
        constraint = *rewarder_account.to_account_info().owner == *token_program.key,
        constraint = rewarder_account.mint == *mint_address.key,
    )]
    pub rewarder_account: Account<'info, anchor_spl::token::TokenAccount>,

    pub mint_address: AccountInfo<'info>,

    system_program: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StakerHistoryEntry {
    pub time:   u64,
    pub action: u8,  //0 staking, 1: unstaking, 2: claim rewarding
    pub amount: u64,
}

#[account]
#[derive(Default)]
pub struct StakingState {
    pub staking_account: Pubkey,
    pub my_crc: u32,
    pub mint_address: Pubkey,    
    pub onwer_address: Pubkey,
    pub total_staked: u64,
    pub total_rewarded: u64,
    pub last_staked: u64,
    pub last_rewarded: u64,
    pub history: Vec<StakerHistoryEntry>
}

impl StakingState{
    pub const MAX_HISTORY: usize = 588;

    pub fn add_history(&mut self, time: u64, action: u8, amount: u64)-> ()
    {
        if self.history.len() >= StakingState::MAX_HISTORY {
            self.history.remove(0);
        }
        self.history.push(StakerHistoryEntry{
            time: time, action: action, amount: amount
        });
    }
}


#[derive(Accounts)]
pub struct InitializeStakeState<'info> {
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(init, payer = authority, space = 8 + 32 + 4 + 32 + 32 + 8 + 8 + 8 + 8)]
    pub stake_state_account: ProgramAccount<'info, StakingState>,

    #[account(signer)]
    pub authority: AccountInfo<'info>,

    system_program: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}


#[derive(Accounts)]
pub struct Staking<'info> {
    #[account(mut)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint = *staking_data.to_account_info().key == stake_state_account.staking_account,
    )]
    pub stake_state_account: ProgramAccount<'info, StakingState>,

    #[account(mut,
        constraint = staking_data.escrow_account == *escrow_account.to_account_info().key,
    )]
    pub escrow_account: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut,
        constraint = *staker_account.to_account_info().owner == *token_program.key,
        constraint = staker_account.mint == staking_data.mint_address,
        constraint = staker_account.owner == *authority.key,
    )]
    pub staker_account: Account<'info, anchor_spl::token::TokenAccount>,
            
    #[account(signer,
        constraint = stake_state_account.onwer_address == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Funding<'info> {
    #[account(mut)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint = staking_data.rewarder_account == *rewarder_account.to_account_info().key,
    )]
    pub rewarder_account: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut,
        constraint = *funder_account.to_account_info().owner == *token_program.key,
        constraint = funder_account.mint == staking_data.mint_address,
        constraint = funder_account.owner == *authority.key,
    )]
    pub funder_account: Account<'info, anchor_spl::token::TokenAccount>,
            
    #[account(signer,)]
    pub authority: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}


#[derive(Accounts)]
pub struct Unstaking<'info> {
    #[account(mut)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint = *staking_data.to_account_info().key == stake_state_account.staking_account,
    )]
    pub stake_state_account: ProgramAccount<'info, StakingState>,

    #[account(mut,
        constraint = staking_data.escrow_account == *escrow_account.to_account_info().key,        
    )]
    pub escrow_account: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut,
        constraint = *reclaimer.to_account_info().owner == *token_program.key,
        constraint = reclaimer.mint == staking_data.mint_address,
        constraint = reclaimer.owner == *authority.key,
    )]
    pub reclaimer: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(signer,
        constraint = stake_state_account.onwer_address == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    pub pda_account: AccountInfo<'info>,    

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}
