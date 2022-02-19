const anchor = require('@project-serum/anchor');
const borsh = require('borsh');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
var sha256 = require('js-sha256');
const { v4: uuidv4 } = require('uuid');
const BIPS_PRECISION = 10000;
const utils = require("./utils");
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

async function getPdaAddress(mint, programid)
{
    let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("staking"),
          mint.toBuffer(),
          programid.toBuffer()
        ],
        programid
    );
    return pda[0];
}
async function getPdaAddressBump(mint, programid)
{
    let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("staking"),
          mint.toBuffer(),
          programid.toBuffer()
        ],
        programid
    );
    return pda[1];
}

async function getStateAddress(pda, wallet, programid)
{
    let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("staking"),
          pda.toBuffer(),
          wallet.toBuffer()
        ],
        programid
    );
    return pda[0];
}


async function initialize(program, connection, 
    reward_percent, reward_period_in_sec, mintAddress, signer){

    const pda = await getPdaAddress(mintAddress, program.programId);
    const bump = await getPdaAddressBump(mintAddress, program.programId);
    
    //create pda account
    const pda = await utils.createAccountByAcc(connection, signer, 1024, pda, programId);
    if(pda == null)
        return [null, 'creating staking pda failed!'];

    //create escrowAccount
    const escrow = await utils.createAssociatedTokenAccount(connection, mintAddress,
        signer, pda, true);
    
    let inst = program.instruction.initialize(
        reward_percent, 
        reward_period_in_sec, 
        bump,
        {
        accounts: {
            pdaAccount: pda,
            authority: signer.publicKey,
            escrowAccount: escrow,
            tokenProgram: TOKEN_PROGRAM_ID,
            mintAddress: mintAddress
        }
    });

    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [pda, 'ok'];
    return [null, formatError(program._idl.errors, res[1])];
}

async function initializeStakeState(program, connection, pda, signer){

    //create state account
    let state = await getStateAddress(pda, signer.publicKey, programId);
    state = await utils.createAccountByAcc(connection, signer, 1024, state, programId);
    if(state == null)
        return [null, 'creating staking state failed!'];
   
    let inst = program.instruction.initializeStakeState(
        {
        accounts: {
            pdaAccount: pda,
            stakeStateAccount: state,
            authority: signer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID
        }
    });

    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [state, 'ok'];

    return [null, formatError(program._idl.errors, res[1])];
}


async function staking(program, connection, pda, state, amount, signer){

    //get info from pda
    let stakingData = await program.account.stakingData.fetch(pda);

    let stakerAcc = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer);
    let info = await program.connection.getAccountInfo(stakerAcc);
    if(info==null)
    {
        return [null, 'token account doesn`t exit!'];
    }
   
    let inst = program.instruction.staking(
        new anchor.BN(amount),
        {
        accounts: {
            pdaAccount: pda,
            stakeStateAccount: state,
            escrowAccount: stakingData.escrowAccount,
            stakerAccount: stakerAcc,            
            authority: signer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID
        }
    });

    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];

    return [null, formatError(program._idl.errors, res[1])];
}


async function unstaking(program, connection, pda, state, amount, signer){

    //get info from pda
    let stakingData = await program.account.stakingData.fetch(pda);
    const reclaimer = await utils.getAssociatedTokenAddress(stakingData.mintAddress, signer.publicKey);
   
    let inst = program.instruction.unstaking(
        new anchor.BN(amount),
        {
        accounts: {
            pdaAccount: pda,
            stakeStateAccount: state,
            escrowAccount: stakingData.escrowAccount,
            reclaimer: reclaimer,            
            authority: signer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID
        }
    });

    const res = await utils.performInstructions(connection, signer, [inst]);
    if(res[0])
        return [amount, 'ok'];

    return [null, formatError(program._idl.errors, res[1])];
}



class Clock{
    slot = 0
    epoch_start_timestamp = 0;
    epoch = 0;
    leader_schedule_epoch = 0;
    unix_timestamp =0;
    deser(buffer){
        const reader = new borsh.BinaryReader(buffer);
        this.slot = reader.readU64().toNumber();
        this.epoch_start_timestamp = reader.readU64().toNumber();
        this.epoch = reader.readU64().toNumber();
        this.leader_schedule_epoch = reader.readU64().toNumber();
        this.unix_timestamp = reader.readU64().toNumber();
    }
}

async function get_now_ts(provider){
    const accountInfo = await provider.connection.getAccountInfo(anchor.web3.SYSVAR_CLOCK_PUBKEY);
    let clock = new Clock();
    clock.deser(accountInfo.data);
    return clock.unix_timestamp;
}


module.exports = {
    initialize,
    initializeStakeState,
    staking,
    unstaking,
    get_now_ts,
};
