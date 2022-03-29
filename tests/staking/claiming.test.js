const utils = require('../../lib/utils');

const assert = require('assert');
const anchor = require('@project-serum/anchor');
const splToken = require('@solana/spl-token');
const process = require('process');
const os = require('os');
const fs = require('fs');
const lib = require('../lib');

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
  

describe('Claiming tests', () => {
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
    const minTimeframeInSecond = 30;
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

    it('Claiming for not gained', async () => {
        //first staking
        const amount = 1000;
        const escrowAccount = await utils.getEscrowAccount(stakingDataAccount, program.programId);
        const escrowAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);        
        await lib.staking(program, stakingDataAccount, stakerAccount, amount, stakerInitializer);

        const escrowAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, escrowAccount);
        const stakerAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(escrowAccountBalance1 === escrowAccountBalance + amount);
        assert(stakerAccountBalance1 === stakerAccountBalance - amount);

        const stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.totalStaked.toNumber() === amount);
        
        //try claiming
        res = await lib.claimReward(program, stakingDataAccount, stakerAccount, 100, stakerInitializer);
        assert(res === 'insufficient gained reward')
        
    });

    it('Claiming full amount', async () => {
        //first staking
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

        //funding
        const fundAmount = 1000;
        const timeframeInSecond = 30;
        await lib.funding(program, stakingDataAccount, funderAccount, fundAmount, timeframeInSecond, funderAuthority);
        stakingData = await utils.getStakingData(program, stakingDataAccount);

        //sleep 32 second call funding again
        console.log("waiting 32 seconds");
        await sleep(32000);

        await lib.funding(program, stakingDataAccount, funderAccount, fundAmount, timeframeInSecond, funderAuthority);
        stakingData = await utils.getStakingData(program, stakingDataAccount);
        const gainedReward = stakingData.stakers[0].gainedReward.toNumber();
        assert(stakingData.payoutReward.toNumber() === gainedReward);

        console.log("claiming gained reward=", gainedReward);
        const res = await lib.claimReward(program, stakingDataAccount, stakerAccount, gainedReward, stakerInitializer);
  
        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + gainedReward);
        stakingData = await utils.getStakingData(program, stakingDataAccount);

        console.log(stakingData);

        assert(stakingData.totalRewardPaid.toNumber() === gainedReward);
        assert(stakingData.payoutReward.toNumber() === 0);
        assert(stakingData.stakers[0].gainedReward.toNumber() === 0);

    });

    it('Claiming some amount', async () => {
        //first staking
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

        //funding
        const fundAmount = 1000;
        const timeframeInSecond = 30;
        await lib.funding(program, stakingDataAccount, funderAccount, fundAmount, timeframeInSecond, funderAuthority);
        stakingData = await utils.getStakingData(program, stakingDataAccount);

        //sleep 32 second call funding again
        console.log("waiting 32 seconds");
        await sleep(32000);

        await lib.funding(program, stakingDataAccount, funderAccount, fundAmount, timeframeInSecond, funderAuthority);
        stakingData = await utils.getStakingData(program, stakingDataAccount);
        const gainedReward = stakingData.stakers[0].gainedReward.toNumber();
        assert(stakingData.payoutReward.toNumber() === gainedReward);

        console.log("claiming gained reward=", 1);
        const res = await lib.claimReward(program, stakingDataAccount, stakerAccount, 1, stakerInitializer);
  
        const stakerAccountBalance2 = await utils.getTokenAccountBalance(program.provider.connection, stakerAccount);
        assert(stakerAccountBalance2 === stakerAccountBalance1 + 1);
        stakingData = await utils.getStakingData(program, stakingDataAccount);

        assert(stakingData.totalRewardPaid.toNumber() === 1);
        assert(stakingData.payoutReward.toNumber() === gainedReward - 1);
        assert(stakingData.stakers[0].gainedReward.toNumber() === gainedReward - 1);

        const nowTs = await utils.getNowTs(program.provider.connection);
        const reward = utils.calculateReward(800, 1000, 1000, 0, 30, 1000, 0, stakingData.minStakePeriod, nowTs);
        console.log("reward=", reward);
    });
})