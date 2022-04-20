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

    #[msg("insufficient gained reward")]
    InSufficientGainedReward,

    #[msg("insufficient rewarder reward")]
    InSufficientRewarderBalance,

    #[msg("exist un-claimed reward")]
    ExistUnClaimedReward,

    #[msg("amount must big than zero")]
    AmountMustBigThanZero,

    #[msg("timeframe must big than min")]
    TimeframeMustBigThanMin,

    #[msg("timeframe must big than min stake period")]
    TimeframeMustBigThanMinStakePeriod,

    #[msg("min stake period must less than current timeframe")]
    MinStakePeriodMustBeLessThanCurrentTimeFrame,

    #[msg("apy max must big than 100")]
    ApyMaxMustBigThan100,

    #[msg("apy max must less than 10000")]
    ApyMaxMustLessThan10000,

    #[msg("min timeframe must big than zero")]
    MinTimeFrameMustBigThanZero,

    #[msg("min stake period must big than zero")]
    MinStakePeriodMustBigThanZero,

}
