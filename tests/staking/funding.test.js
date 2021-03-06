const utils = require('../../lib/utils');

const assert = require('assert');
const anchor = require('@project-serum/anchor');
const splToken = require('@solana/spl-token');
const process = require('process');
const os = require('os');
const fs = require('fs');
const lib = require('../lib');

describe('Funding tests', () => {
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
    const minTimeframeInSecond = 31;
    const minStakePeriod = 32;
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

    it('Can`t set less than min_time_frame', async () => {
        const amount = 1000;
        const timeframeInSecond = minTimeframeInSecond - 1;
        const res = await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);
        assert(res === 'timeframe must big than min');
    });


    it('Funding', async () => {
        const amount = 1000;
        const timeframeInSecond = 3600;

        const rewarderAccount = await utils.getRewarderAccount(stakingDataAccount, program.programId);
        const rewarderAccountBalance = await utils.getTokenAccountBalance(program.provider.connection, rewarderAccount);
        const funderBalance = await utils.getTokenAccountBalance(program.provider.connection, funderAccount);
        await lib.funding(program, stakingDataAccount, funderAccount, amount, timeframeInSecond, funderAuthority);

        const rewarderAccountBalance1 = await utils.getTokenAccountBalance(program.provider.connection, rewarderAccount);
        const funderBalance1 = await utils.getTokenAccountBalance(program.provider.connection, funderAccount);
        assert(rewarderAccountBalance1 === rewarderAccountBalance + amount);
        assert(funderBalance1 === funderBalance - amount);

        const stakingData = await utils.getStakingData(program, stakingDataAccount);
        assert(stakingData.poolReward.toNumber() === amount);
    });

    it('Funding insufficient amount', async () => {
        const timeframeInSecond = 3600;
        const funderBalance = await utils.getTokenAccountBalance(program.provider.connection, funderAccount);
        const res = await lib.funding(program, stakingDataAccount, funderAccount, funderBalance + 1, timeframeInSecond, funderAuthority);
        assert(res === "insufficient balance")
    });

    it('Funding timeframe must big than min stake period', async () => {
        const amount = 1000;
        const res = await lib.funding(program, stakingDataAccount, funderAccount, amount, minStakePeriod - 1, funderAuthority);
        assert(res === "timeframe must big than min stake period")
    });

})