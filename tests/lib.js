const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const utils = require('../lib/utils');

function formatError(errors, err) {
    if (err.InstructionError !== null && err.InstructionError.length === 2) {
        const errCode = err.InstructionError[1].Custom;
        if (errCode >= errors[0].code && errCode <= errors[errors.length - 1].code) {
            return errors[errCode - errors[0].code].msg;
        }
        return `Custom erro code= ${errCode}`;
    }
    console.log(err);
    return 'unknown error';
}

function parseErrorNumber(errors, logs) {
    const key = 'Program log: Custom program error: ';
    for (let i = 0; i < logs.length; i++) {
        if (logs[i].indexOf(key) >= 0) {
            const numStr = logs[i].substring(key.length);
            const errorNum = Number(numStr);
            const idx = errorNum % 100;
            return errors[idx].msg;
        }
    }
    return undefined;
}


async function initialize(
    program,
    funderAuthority,
    mintAddress,
    apyMax,
    minTimeframeInSecond,
    minStakePeriod,
    signer,
) {
    const stakingDataAccount = await utils.getStakingDataAccount(signer.publicKey, mintAddress, program.programId);
    const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
    const rewarderAccount = await utils.getRewarderAccount(stakingDataAccount, program.programId);
    let result;
    try{
        await program.rpc.initialize(
            apyMax,
            new anchor.BN(minTimeframeInSecond),
            new anchor.BN(minStakePeriod),
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    funderAuthority: funderAuthority,
                    escrowAccount: escrowAccount,
                    rewarderAccount: rewarderAccount,
                    authority: signer.publicKey,
                    mintAddress: mintAddress,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                },
                signers: [signer],
            },
        );
        result = stakingDataAccount;
    } catch(e)    {
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;
    }
    return stakingDataAccount;
}

async function initializeStakeState(
    program,
    stakingDataAccount,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "didn't init staking";
    }
    const stakeStateAccount = await utils.getStakingStateAccount(stakingDataAccount, signer.publicKey, program.programId);

    let result;
    try{
        await program.rpc.initializeStakeState(
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    stakeStateAccount: stakeStateAccount,
                    authority: signer.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                },
                signers: [signer],
            },
        );    
        result = stakeStateAccount;
    }catch(e)
    {
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;
    }
    return result;
}


async function staking(
    program,
    stakingDataAccount,
    stakerAccount,
    amount,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }
    const stakeStateAccount = await utils.getStakingStateAccount(stakingDataAccount, signer.publicKey, program.programId);
    const stakeState = await utils.getStakingState(program, stakeStateAccount);
    if(stakeState == null)
    {
        return "stakingState didn't init";
    }
    let result;

    try{
        await program.rpc.staking(
            new anchor.BN(amount),
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    stakeStateAccount: stakeStateAccount,
                    escrowAccount: stakingData.escrowAccount,
                    stakerAccount: stakerAccount,
                    authority: signer.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [signer],
            },
        );
        result = amount;
    }catch(e)    {
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;
    }
    return result;
}


async function unstaking(
    program,
    stakingDataAccount,
    reclaimer,
    amount,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }
    const stakeStateAccount = await utils.getStakingStateAccount(stakingDataAccount, signer.publicKey, program.programId);
    const stakeState = await utils.getStakingState(program, stakeStateAccount);
    if(stakeState == null)
    {
        return "stakingState didn't init";
    }

    const stakingAuthority = await utils.getStakingAuthAccount(stakingDataAccount, program.programId);
    let result;
    try{
        await program.rpc.unstaking(
            new anchor.BN(amount),
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    stakeStateAccount: stakeStateAccount,
                    escrowAccount: stakingData.escrowAccount,
                    reclaimer: reclaimer,
                    rewarderAccount: stakingData.rewarderAccount,
                    authority: signer.publicKey,
                    stakingAuthority: stakingAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [signer],
            },
        );   
        result = amount; 
    }catch(e){
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;
    }
    return result;
}

async function claimReward(
    program,
    stakingDataAccount,
    claimer,
    amount,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }
    const stakeStateAccount = await utils.getStakingStateAccount(stakingDataAccount, signer.publicKey, program.programId);
    const stakeState = await utils.getStakingState(program, stakeStateAccount);
    if(stakeState == null)
    {
        return "stakingState didn't init";
    }

    const stakingAuthority = await utils.getStakingAuthAccount(stakingDataAccount, program.programId)
    let result;
    try{
        await program.rpc.claimReward(
            new anchor.BN(amount),
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    stakeStateAccount: stakeStateAccount,
                    rewarderAccount: stakingData.rewarderAccount,
                    claimer: claimer,
                    authority: signer.publicKey,
                    stakingAuthority: stakingAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [signer],
            },
        );    
        result = amount;
    } catch (e){
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;
    }
    return result;
}

async function funding(
    program,
    stakingDataAccount,
    funderAccount,
    amount,
    timeframeInSecond,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }

    let result;
    try{
        await program.rpc.funding(
            new anchor.BN(amount),
            new anchor.BN(timeframeInSecond),
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    rewarderAccount: stakingData.rewarderAccount,
                    funderAccount: funderAccount,
                    authority: signer.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [signer],
            },
        );    
        result = amount;
    }catch(e){
        console.log(e);
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;        
    }
    return result;
}

async function setMaxApy(
    program,
    stakingDataAccount,
    apyMax,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }

    let result;
    try{
        await program.rpc.setMaxApy(
            apyMax,
            {
                accounts: {
                    stakingData: stakingDataAccount,
                    authority: signer.publicKey,
                },
                signers: [signer],
            },
        );    
        result = apyMax;
    }catch(e){
        console.log(e);
        if (e.msg === undefined) {
            result = parseErrorNumber(program._idl.errors, e.logs);
        } else result = e.msg;        
    }
    return result;
}


module.exports = {
    initialize,   
    initializeStakeState,
    staking,
    unstaking,
    claimReward,
    funding,
    setMaxApy
}

