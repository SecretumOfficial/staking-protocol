pub fn calculate_reward(apy_max: u64, pool_staked: u64, pool_reward: u64, 
    time_frame_start: u64, time_frame_end: u64, staked: u64, stake_start_time: u64, min_stake_period: u64, now_ts: u64) -> u64
{
    if staked == 0 || stake_start_time >= time_frame_end{
        return 0;
    }

    let mut seconds = now_ts.checked_sub(stake_start_time).unwrap();

    let frame_seconds = time_frame_end.checked_sub(time_frame_start).unwrap();
    if seconds > frame_seconds {
        seconds = frame_seconds;
    }

    if seconds < min_stake_period {
        return 0;
    }

    let days: f64 = (seconds as f64)/ ((3600 * 24) as f64);
    let frame_days: f64 = frame_seconds as f64 / ((3600 * 24) as f64);
    let gained_total = (pool_reward as f64 * days * (staked as f64))/ (frame_days * (pool_staked as f64));
    let gained_per_day = gained_total / days;
    let staked_per_day = staked as f64 / days;
    let mut gained_percent_per_day = gained_per_day * 100.00 / staked_per_day;
    let apd_max = apy_max as f64 / 365.50;

    if gained_percent_per_day > apd_max{
        gained_percent_per_day = apd_max;
    }

    let gained = gained_percent_per_day * staked_per_day * days / 100.00;
    return gained as u64;
}
