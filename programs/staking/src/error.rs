use anchor_lang::prelude::*;

#[error]
pub enum StakingErrors {
    #[msg("invalid staking account data")]
    InvalidStakingAccount,
}
