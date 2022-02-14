use anchor_lang::prelude::*;

#[error]
pub enum StakingErrors {
    #[msg("invalid staking account data")]
    InvalidStakingAccount,

    #[msg("invalid staking state account data")]
    InvalidStakingStateAccount,

    #[msg("insufficient balance")]
    InSufficientBalance,

    #[msg("insufficient escrow balance")]
    InSufficientEscrowBalance,
}
