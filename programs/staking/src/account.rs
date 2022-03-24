use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, SetAuthority, Transfer}
};
//use anchor_lang::solana_program::*;

pub const STAKING_PDA_SEED: &[u8] = b"staking";
pub const STAKER_PDA_SEED: &[u8] = b"staker";
pub const STAKING_ESCROW_PDA_SEED: &[u8] = b"staking-escrow";
pub const STAKING_REWARDER_PDA_SEED: &[u8] = b"staking-rewarder";
pub const STAKING_AUTH_PDA_SEED: &[u8] = b"staking-author";

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
    pub initializer: Pubkey,
    pub funder_authority: Pubkey,
    pub mint_address: Pubkey,
    pub escrow_account: Pubkey,
    pub rewarder_account: Pubkey,
    pub rewarder_balance: u64,
    pub total_funded: u64,
    pub total_reward_paid: u64,

    pub bump_auth: u8,
    pub total_staked: u64,

    //funding 
    pub min_timeframe_in_second: u64,
    pub timeframe_in_second: u64,
    pub timeframe_started: u64,
    pub pool_reward: u64,
    pub payout_reward: u64,
    pub apy_max: u32,
    pub min_stake_period: u64,

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
    #[account(init,
        seeds = [STAKING_PDA_SEED, authority.key.as_ref(), mint_address.key.as_ref()],
        bump,
        payer = authority, 
        space = 10240)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    pub funder_authority: AccountInfo<'info>,

    #[account(
        init,
        seeds = [STAKING_ESCROW_PDA_SEED, staking_data.to_account_info().key.as_ref()],
        bump,
        payer = authority,
        token::mint = mint_address,
        token::authority = authority,
    )]    
    pub escrow_account: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [STAKING_REWARDER_PDA_SEED, staking_data.to_account_info().key.as_ref()],
        bump,
        payer = authority,
        token::mint = mint_address,
        token::authority = authority,
    )]    
    pub rewarder_account: Account<'info, TokenAccount>,

    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    pub mint_address: AccountInfo<'info>,

    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Initialize<'info> {
    pub fn into_set_escrow_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.escrow_account.to_account_info().clone(),
            current_authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
    pub fn into_set_rewarder_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.rewarder_account.to_account_info().clone(),
            current_authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
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

    #[account(init, 
        seeds = [STAKER_PDA_SEED, staking_data.to_account_info().key.as_ref(), authority.key.as_ref()],
        bump,
        payer = authority, 
        //space = 8 + 32 + 4 + 32 + 32 + 8 + 8 + 8 + 8
        space = 10240
    )]
    pub stake_state_account: ProgramAccount<'info, StakingState>,

    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
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
            
    #[account(mut, signer,
        constraint = stake_state_account.onwer_address == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Staking<'info> {
    pub fn into_transfer_to_escrow_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.staker_account.to_account_info().clone(),
            to: self.escrow_account.to_account_info().clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
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
            
    #[account(mut, 
        signer,
        constraint = staking_data.funder_authority == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Funding<'info> {
    pub fn into_transfer_to_rewarder_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.funder_account.to_account_info().clone(),
            to: self.rewarder_account.to_account_info().clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
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

    #[account(mut, signer,
        constraint = stake_state_account.onwer_address == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    pub staking_authority: AccountInfo<'info>,    

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Unstaking<'info> {
    pub fn into_transfer_to_staker_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.escrow_account.to_account_info().clone(),
            to: self.reclaimer.to_account_info().clone(),
            authority: self.staking_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}


#[derive(Accounts)]
pub struct Claiming<'info> {
    #[account(mut)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint = *staking_data.to_account_info().key == stake_state_account.staking_account,
    )]
    pub stake_state_account: ProgramAccount<'info, StakingState>,

    #[account(mut,
        constraint = staking_data.rewarder_account == *rewarder_account.to_account_info().key,
    )]
    pub rewarder_account: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut,
        constraint = *claimer.to_account_info().owner == *token_program.key,
        constraint = claimer.mint == staking_data.mint_address,
        constraint = claimer.owner == *authority.key,
    )]
    pub claimer: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut, signer,
        constraint = stake_state_account.onwer_address == *authority.key,
    )]
    pub authority: AccountInfo<'info>,

    pub staking_authority: AccountInfo<'info>,    

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Claiming<'info> {
    pub fn into_transfer_to_claimer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.rewarder_account.to_account_info().clone(),
            to: self.claimer.to_account_info().clone(),
            authority: self.staking_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

#[derive(Accounts)]
pub struct ChnageSetting<'info> {
    #[account(mut)]
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(mut, signer,
        constraint = staking_data.initializer == *authority.key,
    )]
    pub authority: AccountInfo<'info>,
}
