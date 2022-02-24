use anchor_lang::prelude::*;
//use anchor_lang::solana_program::*;

#[account]
#[derive(Default)]
pub struct StakingData {
    pub mint_address: Pubkey,
    pub escrow_account: Pubkey,
    pub rewarder_account: Pubkey,
    pub rewarder_balance: u64,
    pub bump_seed: u8,
    pub reward_percent: u8,
    pub reward_period_in_sec: u32, 
    pub total_staked: u64
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 32 + 32 + 8 + 1 + 1 + 4 + 8)]
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


#[account]
#[derive(Default)]
pub struct StakingState {
    pub staking_account: Pubkey,
    pub mint_address: Pubkey,    
    pub onwer_address: Pubkey,
    pub total_staked: u64,
    pub total_rewarded: u64,
    pub last_staked: u64,
    pub last_rewarded: u64,
}

#[derive(Accounts)]
pub struct InitializeStakeState<'info> {
    pub staking_data: ProgramAccount<'info, StakingData>,

    #[account(init, payer = authority, space = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8)]
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
