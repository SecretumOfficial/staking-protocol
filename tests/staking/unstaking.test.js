const utils = require('../../lib/utils');

const assert = require('assert');
const anchor = require('@project-serum/anchor');
const splToken = require('@solana/spl-token');
const process = require('process');
const os = require('os');
const fs = require('fs');
const lib = require('../lib');

function sleep_sec(s) {
    console.log("waiting...", s, "seconds")
    return sleep(s * 1000)
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

describe('Unstaking tests', () => {
    const homedir = os.homedir();
    process.env.ANCHOR_WALLET = `${homedir}/.config/solana/id.json`;

    // Configure the local cluster.
    const provider = anchor.Provider.local();
    anchor.setProvider(provider);

    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync('./target/idl/staking.json', 'utf8'));

    // Address of the deployed program.
    const programId = new anchor.web3.PublicKey(idl.metadata.address);
    const program = new anchor.Program(idl, programId);
    const mintAuthority = anchor.web3.Keypair.generate();

    let mint;
    let stakingInitializer;
    let stakerInitializer;
    let stakerAccount;
    let stakingDataAccount;

    let funderAuthority;
    let funderAccount;
    const minTimeframeInSecond = 60;
    const minStakePeriod = 30;
    const apyMax = 800;


    beforeEach(async () => {
        // create wallet A
        stakingInitializer = anchor.web3.Keypair.generate();
        await utils.createWallet(provider.connection, stakingInitializer.publicKey, 1000_000_000);
        mint = await splToken.Token.createMint(
            provider.connection,
            stakingInitializer,
            mintAuthority.publicKey,
            null,
            0,
            splToken.TOKEN_PROGRAM_ID,
        );

        //init funder
        funderAuthority = anchor.web3.Keypair.generate();
        await utils.createWallet(provider.connection, funderAuthority.publicKey, 1000_000_000);         
        funderAccount = await mint.createAccount(funderAuthority.publicKey);
        await mint.mintTo(funderAccount, mintAuthority.publicKey, [mintAuthority], 100_000_000_000);

        //init staker
        stakerInitializer = anchor.web3.Keypair.generate();
        await utils.createWallet(provider.connection, stakerInitializer.publicKey, 1000_000_000);
        stakerAccount = await mint.createAccount(stakerInitializer.publicKey);        
        await mint.mintTo(stakerAccount, mintAuthority.publicKey, [mintAuthority], 100_000_000_000);

        //init staking
        stakingDataAccount = await lib.initialize(program, funderAuthority.publicKey, mint.publicKey, apyMax, minTimeframeInSecond, minStakePeriod, stakingInitializer);

        //init staker state
        const stakerStateAccount = await lib.initializeStakeState(program, stakingDataAccount, stakerInitializer);
        const stakerState = await utils.getStakingState(program, stakerStateAccount);
        assert(stakerState.stakingAccount.toBase58() === stakingDataAccount.toBase58());
        assert(stakerState.mintAddress.toBase58() === mint.publicKey.toBase58());
        assert(stakerState.onwerAddress.toBase58() === stakerInitializer.publicKey.toBase58());
    });

    it.skip('UnStaking full amount', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);        
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //unstaking
        const unstakingAmount = 1000;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount - unstakingAmount);
        assert(stakingData.stakers.length === 0);
    });

    it.skip('UnStaking some amount', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);        
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //unstaking
        const unstakingAmount = 500;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount - unstakingAmount);
        assert(stakingData.stakers.length === 1);
    });

    it.skip('UnStaking big amount than staked', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);        
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //unstaking
        const unstakingAmount = amount + 1;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === 'insufficient staked balance')

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);
    });

    it.skip('UnStaking some amount before min stake period', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        //unstaking
        const unstakingAmount = 500;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount);


        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers[0].gainedReward.toNumber() === 0)
    });

    it.skip('UnStaking full amount before min stake period', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        //unstaking
        const unstakingAmount = amount;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount);

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers.length === 0)
    });

    it.skip('UnStaking some amount before min stake period with some delay', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        //wait some period
        await sleep_sec(minStakePeriod - 5);

        //unstaking
        const unstakingAmount = 500;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount);


        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers[0].gainedReward.toNumber() === 0)
    });

    it.skip('UnStaking full amount before min stake period with some delay', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        //delay
        await sleep_sec(minStakePeriod - 5);

        //unstaking
        const unstakingAmount = amount;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount);

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers.length === 0)
    });

    it.skip('UnStaking some amount after min stake period with some delay', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        stakingData = await utils.getStakingData(program, stakingDataAccount);
       
        //wait some period
        await sleep_sec(minStakePeriod + 1);

        //unstaking
        const unstakingAmount = 500;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount);

        const nowTs = await utils.getNowTs(program.provider.connection);
        const gainedReward = utils.calculateReward(
            stakingData.apyMax, 
            stakingData.totalStaked.toNumber(),
            stakingData.poolReward.toNumber(),
            stakingData.timeframeStarted.toNumber(),
            stakingData.timeframeStarted.toNumber() + stakingData.timeframeInSecond.toNumber(),
            500,
            stakingData.stakers[0].stakedTime.toNumber(),
            stakingData.minStakePeriod.toNumber(),
            nowTs);

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers[0].gainedReward.toNumber() > 0);
        assert(stakingData.stakers[0].gainedReward.toNumber() === Math.trunc(gainedReward));
    });

    it('UnStaking full amount after min stake period with some delay', async () => {
        //staking 
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        let stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        assert(stakingData.stakers.length === 1);

        //first fund 
        const timeframeInSecond = 100
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        stakingData = await utils.getStakingData(program, stakingDataAccount);
       
        //wait some period
        await sleep_sec(minStakePeriod + 1);

        //unstaking
        const unstakingAmount = amount;
        const res = await lib.unstaking(program, stakingDataAccount, stakerAccount, unstakingAmount, stakerInitializer);
        assert(res === unstakingAmount)

        const nowTs = await utils.getNowTs(program.provider.connection);
        const gainedReward = utils.calculateReward(
            stakingData.apyMax, 
            stakingData.totalStaked.toNumber(),
            stakingData.poolReward.toNumber(),
            stakingData.timeframeStarted.toNumber(),
            stakingData.timeframeStarted.toNumber() + stakingData.timeframeInSecond.toNumber(),
            unstakingAmount,
            stakingData.stakers[0].stakedTime.toNumber(),
            stakingData.minStakePeriod.toNumber(),
            nowTs);

        assert(gainedReward > 0)

        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + unstakingAmount + Math.trunc(gainedReward));

        stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.stakers.length == 0);
    });

})