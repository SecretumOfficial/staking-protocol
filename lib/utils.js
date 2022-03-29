const splToken = require('@solana/spl-token');
const borsh = require('borsh');
const anchor = require('@project-serum/anchor');

async function performInstructions(connection, signer, insts, signers = null) {
    const trx = new anchor.web3.Transaction().add(...insts);
    trx.feePayer = signer.publicKey;
    trx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;

    if (signers !== null) {
        trx.partialSign(...signers);
    }

    const signed = await signer.signTransaction(trx, signers);

    const transactionSignature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: true },
    );
    const confirmRes = await connection.confirmTransaction(transactionSignature);
    if (confirmRes.value.err == null) {
        return [true, null];
    }

    console.log(confirmRes.value.err);
    return [false, confirmRes.value.err];
}

async function getAssociatedTokenAddress(mintAddr, owner, allowOwnerOffCurve = false) {
    const mint = new splToken.Token(
        null,
        mintAddr,
        splToken.TOKEN_PROGRAM_ID,
        null,
    );

    const acc = await splToken.Token.getAssociatedTokenAddress(
        mint.associatedProgramId,
        splToken.TOKEN_PROGRAM_ID,
        mintAddr,
        owner,
        allowOwnerOffCurve,
    );
    return acc;
}

async function createAssociatedTokenAccount(connection, mintAddr, signer, owner, allowOwnerOffCurve = false) {
    const mint = new splToken.Token(
        connection,
        mintAddr,
        splToken.TOKEN_PROGRAM_ID,
        signer.publicKey,
    );

    const acc = await splToken.Token.getAssociatedTokenAddress(
        mint.associatedProgramId,
        splToken.TOKEN_PROGRAM_ID,
        mintAddr,
        owner,
        allowOwnerOffCurve,
    );

    const accInfo = await connection.getAccountInfo(acc);
    if (accInfo == null) {
        const instructions = [];
        instructions.push(splToken.Token.createAssociatedTokenAccountInstruction(
            mint.associatedProgramId,
            splToken.TOKEN_PROGRAM_ID,
            mintAddr,
            acc,
            owner,
            signer.publicKey,
        ));

        const res = await performInstructions(connection, signer, instructions);
        if (res[0]) {
            return acc;
        }
        return null;
    }
    return acc;
}

async function createWallet(connection, wallet, lamports) {
    let bal = await connection.getBalance(wallet);
    if (bal < lamports) {
        const sig = await connection.requestAirdrop(wallet, lamports - bal);
        await connection.confirmTransaction(sig);
        bal = await connection.getBalance(wallet);
    }
    return wallet;
}


async function getTokenAccountBalance(connection, tokenAccount) {
    try{
        const accInfo = await connection.getTokenAccountBalance(tokenAccount);
        if(accInfo == null)
            return Number(0);    
        return Number(accInfo.value.amount);
    }catch(e)
    {
        return Number(0);
    }
}

async function mintTo(connection, mintAddr, tokenAddr, amount, signer)
{
    let instructions = [];
    instructions.push(
        splToken.Token.createMintToInstruction(splToken.TOKEN_PROGRAM_ID,
            mintAddr, 
            tokenAddr,
            signer.publicKey,
            [],
            amount)
    );
    const res = await performInstructions(connection, signer, instructions);
    if(res[0])
        return amount;
    return null;
}


async function transferToken(connection, fromAddr, toAddr, amount, signer)
{
    let instructions = [];
    instructions.push(
        splToken.Token.createTransferInstruction(
            splToken.TOKEN_PROGRAM_ID,
            fromAddr,
            toAddr,
            signer.publicKey,
            [],
            amount,
        )
      );
    const res = await performInstructions(connection, signer, instructions);
    if(res[0])
        return amount;
    return null;
}


async function getStakingData(program, stakingDataAccount)
{
    try{
        const accData = await program.account.stakingData.fetch(stakingDataAccount);
        return accData;
    }catch(e)
    {
        return null;
    }  
}

async function getStakingState(program, stakingStateAccount)
{
    try{
        const accData = await program.account.stakingState.fetch(stakingStateAccount);
        return accData;
    }catch(e)
    {
        return null;
    }  
}

async function createToken(connection, signer, decimals)
{
    const mintAccount = anchor.web3.Keypair.generate();
    const balanceNeeded = await splToken.Token.getMinBalanceRentForExemptMint(connection);
    let instructions = [];

    instructions.push(anchor.web3.SystemProgram.createAccount({
      fromPubkey: signer.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: balanceNeeded,
      space: 82, //MintLayout.span,
      programId: splToken.TOKEN_PROGRAM_ID
    }));

    instructions.push(splToken.Token.createInitMintInstruction(
        splToken.TOKEN_PROGRAM_ID, 
        mintAccount.publicKey, 
        decimals, 
        signer.publicKey, signer.publicKey));

    const res = await performInstructions(connection, signer, instructions, [mintAccount]);

    if(res[0])
    {
        const token = new splToken.Token(
            connection,
            mintAccount.publicKey,
            splToken.TOKEN_PROGRAM_ID,
            signer.publicKey
        );        
        return token;
    }
    return null;
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

async function getNowTs(connection){
    const accountInfo = await connection.getAccountInfo(anchor.web3.SYSVAR_CLOCK_PUBKEY);
    let clock = new Clock();
    clock.deser(accountInfo.data);
    return clock.unix_timestamp;
}


async function getStakingDataAccount(author, mint, programId){

    const [acc] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staking", "utf-8"), author.toBuffer(), mint.toBuffer()], programId);
    return acc;    
}

async function getEscrowAccount(stakingDataAcc, programId){

    const [acc] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staking-escrow", "utf-8"), stakingDataAcc.toBuffer()], programId);
    return acc;    
}
async function getRewarderAccount(stakingDataAcc, programId){

    const [acc] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staking-rewarder", "utf-8"), stakingDataAcc.toBuffer()], programId);
    return acc;    
}
async function getStakingAuthAccount(stakingDataAcc, programId){

    const [acc] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staking-author", "utf-8"), stakingDataAcc.toBuffer()], programId);
    return acc;    
}

async function getStakingStateAccount(stakingDataAcc, author, programId){

    const [acc] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staker", "utf-8"), stakingDataAcc.toBuffer(), author.toBuffer()], programId);
    return acc;    
}

function calculateReward(apyMax, poolStaked, poolReward, timeFrameStart, timeFrameEnd, staked, stakeStartTime, minStakePeriod, nowTs)
{
    if (staked === 0 || stakeStartTime >= timeFrameEnd){
        return 0;
    }

    let frameSeconds = timeFrameEnd - timeFrameStart;
    let seconds = nowTs - stakeStartTime;

    if (seconds > frameSeconds) {
        seconds = frameSeconds;
    }
    if(seconds < minStakePeriod)
    {
        return 0;
    }

    let days = seconds/ (3600 * 24);
    let frameDays = frameSeconds / (3600 * 24);
    let gainedTotal = (poolReward * days * staked)/ (frameDays * poolStaked);
    let gainedPerDay = gainedTotal / days;
    let stakedPerDay = staked / days;
    let gainedPercentPerDay = gainedPerDay * 100.00 / stakedPerDay;
    let apdMax = apyMax / 365.50;

    if (gainedPercentPerDay > apdMax){
        gainedPercentPerDay = apdMax;
    }

    let gained = gainedPercentPerDay * stakedPerDay * days / 100.00;
    return gained;
}

function getGainedReward(stakingData, stakingState)
{
    for(let i=0; i<stakingData.stakers.length; i++)
    {
        const staker = stakingData.stakers[i];
        if(staker.stakerCrc !== stakingState.myCrc)
            continue;
        return staker.gainedReward.toNumber();
    }
    return 0;
}



module.exports = {
    performInstructions,
    getAssociatedTokenAddress,
    createAssociatedTokenAccount,
    createWallet,
    getTokenAccountBalance,
    mintTo,
    transferToken,
    createToken,
    getNowTs,


    getStakingData,
    getStakingState,

    getStakingDataAccount,
    getEscrowAccount,
    getRewarderAccount,
    getStakingAuthAccount,
    getStakingStateAccount,

    calculateReward,
    getGainedReward,
};
