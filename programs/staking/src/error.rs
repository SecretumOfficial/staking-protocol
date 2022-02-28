use anchor_lang::prelude::*;

#[error]
pub enum StakingErrors {
    #[msg("invalid staking account data")]
    InvalidStakingAccount,

    #[msg("invalid staking state account data")]
    InvalidStakingStateAccount,

    #[msg("invalid staking state account data. Can`t find entry!")]
    InvalidStakingStateAccountCantFindEntry,

    #[msg("invalid staking state account data. Desn`t match amount!")]
    InvalidStakingStateAccountDosentMatchAmount,

    #[msg("reached max stakers = 385!")]
    ReachedMaxStakers,

    #[msg("insufficient balance")]
    InSufficientBalance,

    #[msg("insufficient staked balance")]
    InSufficientStakedBalance,

    #[msg("insufficient escrow balance")]
    InSufficientEscrowBalance,
}
