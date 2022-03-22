const anchor = require('@project-serum/anchor');
const borsh = require('borsh');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const utils = require("../../lib/utils");
const { programId } = require('../config');

function formatError(errors, err)
{
    if(err.InstructionError != null && err.InstructionError.length==2)
    {
        const err_code = err.InstructionError[1].Custom;
        if(err_code >= errors[0].code && err_code <= errors[errors.length-1].code)
        {
            return errors[err_code-errors[0].code].msg;
        }
        return "Custom erro code= " + err_code;
    }
    console.log(err);
    return "unknown error";
}

async function initialize(
    program,
    connection,
    funderAuthority,
    mintAddress,
    apyMax,
    minTimeframeInSecond,
    signer,
) {
    const stakingDataAccount = await utils.getStakingDataAccount(signer.publicKey, mintAddress, program.programId);
    const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
    const rewarderAccount = await utils.getRewarderAccount(stakingDataAccount, program.programId);
    const inst = program.instruction.initialize(
        apyMax,
        new anchor.BN(minTimeframeInSecond),
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
        },
    );
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [stakingDataAccount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];    
}

async function initializeStakeState(
    program,
    connection,
    stakingDataAccount,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "didn't init staking";
    }
    const stakeStateAccount = await utils.getStakingStateAccount(stakingDataAccount, signer.publicKey, program.programId);

    const inst = program.instruction.initializeStakeState(
        {
            accounts: {
                stakingData: stakingDataAccount,
                stakeStateAccount: stakeStateAccount,
                authority: signer.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
        },
    );    
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [stakeStateAccount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];    
}


async function staking(
    program,
    connection,
    stakingDataAccount,
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
    const stakerAccount = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer.publicKey, false);
    const inst = program.instruction.staking(
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
        },
    );
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];    

}


async function unstaking(
    program,
    connection,
    stakingDataAccount,
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
    const reclaimer = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer.publicKey, false);

    const stakingAuthority = await utils.getStakingAuthAccount(stakingDataAccount, program.programId);
    const inst = program.instruction.unstaking(
        new anchor.BN(amount),
        {
            accounts: {
                stakingData: stakingDataAccount,
                stakeStateAccount: stakeStateAccount,
                escrowAccount: stakingData.escrowAccount,
                reclaimer: reclaimer,
                authority: signer.publicKey,
                stakingAuthority: stakingAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        },
    );   
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];    
}

async function claimReward(
    program,
    connection,
    stakingDataAccount,
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
    const claimer = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer.publicKey, false);
    const stakingAuthority = await utils.getStakingAuthAccount(stakingDataAccount, program.programId);
    
    const inst = program.instruction.claimReward(
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
        },
    );    
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];
}

async function funding(
    program,
    connection,
    stakingDataAccount,
    amount,
    timeframeInSecond,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }

    const funderAccount = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer.publicKey, false);
    const inst = program.instruction.funding(
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
        },
    );    
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];
}

async function setMaxApy(
    program,
    connection,
    stakingDataAccount,
    apyMax,
    signer,
) {
    const stakingData = await utils.getStakingData(program, stakingDataAccount);
    if(stakingData == null)
    {
        return "stakingData didn't init";
    }

    const inst = program.instruction.setMaxApy(
        apyMax,
        {
            accounts: {
                stakingData: stakingDataAccount,
                authority: signer.publicKey,
            },
        },
    );    
    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [apyMax, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];        
}

module.exports = {
    initialize,
    initializeStakeState,
    staking,    
    unstaking,
    funding,
    claimReward,    
    setMaxApy,
};
