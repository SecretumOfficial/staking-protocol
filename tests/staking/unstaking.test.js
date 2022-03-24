const utils = require('../../lib/utils');

const assert = require('assert');
const anchor = require('@project-serum/anchor');
const splToken = require('@solana/spl-token');
const process = require('process');
const os = require('os');
const fs = require('fs');
const lib = require('../lib');

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

    it('UnStaking full amount', async () => {
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

    it('UnStaking some amount', async () => {
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

    it('UnStaking big amount than staked', async () => {
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
})