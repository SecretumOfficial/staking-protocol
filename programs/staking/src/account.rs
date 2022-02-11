use anchor_lang::prelude::*;

//#[derive(AnchorSerialize, AnchorDeserialize, Clone)]

#[account]
#[derive(Default)]
pub struct StakingData {
    pub mint_address: Pubkey,
    pub escrow_account: Pubkey,
    pub bump_seed: u8,

    pub reward_percent: u8,
    pub reward_period_in_sec: u32, 
    pub total_staked: u64
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(zero)]
    pub staking_account: ProgramAccount<'info, StakingData>,

    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    #[account(mut,
        constraint = *escrow_account.to_account_info().owner == *token_program.key,
        constraint = escrow_account.mint == *mint_address.key,
    )]
    pub escrow_account: Account<'info, anchor_spl::token::TokenAccount>,

    pub mint_address: AccountInfo<'info>,

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
pub struct InitializeStaking<'info> {
    pub staking_account: ProgramAccount<'info, StakingData>,

    #[account(zero,)]
    pub staker_account: ProgramAccount<'info, StakingState>,

    #[account(signer)]
    pub authority: AccountInfo<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}
