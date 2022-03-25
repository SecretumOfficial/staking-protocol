import './style.css'
import * as web3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import tokenlockIdl from './idl/staking.json';
import {
  programId,
  URL
} from '../config';
const lib = require("./lib");
const utils = require("./utils");
const utils0 = require("../../lib/utils");

window.Buffer = window.Buffer || require('buffer').Buffer;

const getProvider = async () => {
  if ("solana" in window) {
    await window.solana.connect(); // opens wallet to connect to

    const provider = window.solana;
    if (provider.isPhantom) {
      //console.log("Is Phantom installed?  ", provider.isPhantom);
      return provider;
    }
  } else {
    document.write('Install https://www.phantom.app/');
  }
};

const connectWallet = async () => {
  const provider = await getProvider();
  if (provider) {
    try {
      const resp = await window.solana.connect();
      const addressElement = document.getElementById('wallet_address')
      addressElement.innerHTML = resp.publicKey.toString();
    } catch (err) {
      console.log('err', err);
    }
  }

};

const getAnchorProvider = async () => {
  const wallet = await getProvider();
  const connection = new web3.Connection(URL, 'confirmed');

  const provider = new anchor.Provider(
    connection, wallet, 'confirmed',
  );

  return provider;
};


const createMint = async () => {
  const decimals = document.getElementById('mint_decimal').value;
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  console.log(provider.publicKey.toString());
  const mint = await utils.createToken(connection, provider, decimals);
  if(mint!=null)
  {
    document.getElementById('mint_address').value = mint.publicKey.toBase58();
    //document.getElementById('mint_authority').value = JSON.stringify(Array.from(mint.payer.secretKey));
  }else{
    alert('error!');
  }  
}


const refreshAccounts = async () => {
  const mintAddr = new anchor.web3.PublicKey(document.getElementById('mint_address').value);  
  const provider = await getProvider();
  const connection = new web3.Connection(URL, 'confirmed');
  let accs = await connection.getTokenAccountsByOwner(provider.publicKey, {mint: mintAddr});
  let accsStr = "";
  accs.value.forEach(acc =>{
    accsStr = accsStr + acc.pubkey.toBase58() + "\n";
  });  
  document.getElementById('accounts').value = accsStr;  
}

const createNewAccount = async () => {
  const mintAddr = new anchor.web3.PublicKey(document.getElementById('mint_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const acc = await utils.createAssociatedTokenAccount(connection, mintAddr, provider, provider.publicKey);

  if(acc !=null)
    await refreshAccounts();
}


const accountInfo = async () => {
  const mintAddr = new anchor.web3.PublicKey(document.getElementById('mint_address').value);  
  const provider = await getProvider();
  const connection = new web3.Connection(URL, 'confirmed');
  const mint = new splToken.Token(
    connection,
    mintAddr,
    splToken.TOKEN_PROGRAM_ID,
    provider.publicKey
  );
  const acc = new web3.PublicKey(document.getElementById("transfer_to_address").value);
  let info = await mint.getAccountInfo(acc);
  document.getElementById("acc_info_bal").value = info.amount.toNumber();
}

const mintTo = async () => {
  const mintAddr = new anchor.web3.PublicKey(document.getElementById('mint_address').value);    
  const provider = await getProvider();
  const destPublicKey = new web3.PublicKey(document.getElementById("transfer_to_address").value);  
  const amount = document.getElementById('transfer_amount').value;  
  const connection = new web3.Connection(URL, 'confirmed');

  const res = utils.mintTo(connection, mintAddr, destPublicKey, amount, provider);
  if(res != null)
    alert('minto success');
}

const transfer = async () => {
  const destPublicKey = new web3.PublicKey(document.getElementById('transfer_to_address').value);
  const mintPublicKey = new web3.PublicKey(document.getElementById('mint_address').value);
  const amount = document.getElementById('transfer_amount').value;

  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();

  const token = new splToken.Token(
    connection,
    mintPublicKey,
    splToken.TOKEN_PROGRAM_ID,
    provider.publicKey,
  );

  const fromTokenAccountPK = (await token.getOrCreateAssociatedAccountInfo(
    provider.publicKey,
  )).address;

  const receiverAccount = await connection.getAccountInfo(destPublicKey);
  if (receiverAccount === null) {
    alert('There is no token account for recipient');
    return
  }
  const res = await utils.transferToken(connection, 
    fromTokenAccountPK, 
    destPublicKey,
    amount,
    provider);

  if(res!=null)
    await refreshAccounts();
};


const initStaking = async () => {
  const mintPublicKey = new web3.PublicKey(document.getElementById('mint_address').value);  
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchorProvider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchorProvider);
  const apyMax = document.getElementById("apy_max").value;
  const minTimeFrame = document.getElementById("min_time_frame").value;
  const minStakePeriod = document.getElementById("min_stake_period").value;    
  
  const funderAuthority = new web3.PublicKey(document.getElementById('funder_authority').value);  

  const res = await lib.initialize(program, 
    connection, 
    funderAuthority, 
    mintPublicKey,
    apyMax, 
    minTimeFrame, //24 * 3600
    minStakePeriod,
    provider
  );

  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    document.getElementById("staking_address").value = res[0];
  }
}

const initStakingState = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchorProvider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchorProvider);

  const res = await lib.initializeStakeState(program, connection, stakingDataAccount, provider);

  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    document.getElementById("state_address").value = res[0];
  }
}

const Staking = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchorProvider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchorProvider);
  const stakeAmount = Number(document.getElementById('stake_amount').value);

  const res = await lib.staking(program, connection, stakingDataAccount, stakeAmount, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await stat_refresh();
    await myStat();
  }
}

const Unstaking = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchorProvider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchorProvider);
  const stakeAmount = Number(document.getElementById('stake_amount').value);

  const res = await lib.unstaking(program, connection, stakingDataAccount, stakeAmount, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await statRefresh();
    await myStat();
  }
}


const ClaimReward = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchorProvider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchorProvider);
  const claimAmount = Number(document.getElementById('gained_reward_amount').value);

  const res = await lib.claimReward(program, connection, stakingDataAccount, claimAmount, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await statRefresh();
    await myStat();
  }
}

const Funding = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const poolReward = Number(document.getElementById('pool_reward_amount').value);
  const timeFrame = Number(document.getElementById('timeframe_in_secs').value);

  const res = await lib.funding(program, connection, 
    stakingDataAccount, poolReward, timeFrame, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await statRefresh();
  }
}


const SetAPYMax = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const apyMax = Number(document.getElementById('apy_max').value);

  const res = await lib.setMaxApy(program, connection, 
    stakingDataAccount, apyMax, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await statRefresh();
    await myStat();
  }
}




const statRefresh = async () => {
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const stakingDataAccount = new anchor.web3.PublicKey(document.getElementById("staking_address").value);
  let stakingData = await program.account.stakingData.fetch(stakingDataAccount);

  document.getElementById('total_staked').innerHTML = stakingData.totalStaked.toNumber();
  document.getElementById('apy_max1').innerHTML = stakingData.apyMax;
  document.getElementById('funder_authority1').innerHTML = stakingData.funderAuthority.toString();

  document.getElementById('rewarder_balance').innerHTML = stakingData.rewarderBalance.toNumber();
  document.getElementById('total_funded').innerHTML = stakingData.totalFunded;
  document.getElementById('total_reward_paid').innerHTML = stakingData.totalRewardPaid;

  document.getElementById('total_staked').innerHTML = stakingData.totalStaked.toNumber();
  document.getElementById('pool_reward').innerHTML = stakingData.poolReward;
  document.getElementById('timeframe_started').innerHTML = stakingData.timeframeStarted;
  document.getElementById('timeframe_in_seconds').innerHTML = stakingData.timeframeInSecond;
  document.getElementById('payout_reward').innerHTML = stakingData.payoutReward;


}


const myStat = async () => {
  const stakingDataAccount = new web3.PublicKey(document.getElementById('staking_address').value);
  const state = new web3.PublicKey(document.getElementById('state_address').value);  
  const connection = new web3.Connection(URL, 'confirmed');
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const stateData = await program.account.stakingState.fetch(state);
  const stakingData = await program.account.stakingData.fetch(stakingDataAccount);  
  const gainedReward = utils0.getGainedReward(stakingData, stateData);

  document.getElementById('my_staked').innerHTML = stateData.totalStaked.toNumber();
  document.getElementById('my_rewarded').innerHTML = stateData.totalRewarded.toNumber();
  document.getElementById('last_staked').innerHTML = stateData.lastStaked.toNumber();
  document.getElementById('last_rewarded').innerHTML = stateData.lastRewarded.toNumber();
  document.getElementById('gained_reward').innerHTML = gainedReward;
}

(() => {
  const btn_connect = document.getElementById('connect_btn');
  btn_connect.addEventListener('click', connectWallet);

  const btn_transfer = document.getElementById('transfer_btn');
  btn_transfer.addEventListener('click', transfer);

  const create_mint_btn = document.getElementById('create_mint_btn');
  create_mint_btn.addEventListener('click', createMint);


  const refresh_btn = document.getElementById('refresh_btn');  
  refresh_btn.addEventListener('click', refreshAccounts);

  const create_new_btn = document.getElementById('create_new_btn');  
  create_new_btn.addEventListener('click', createNewAccount);

  const acc_info_btn = document.getElementById('acc_info_btn');  
  acc_info_btn.addEventListener('click', accountInfo);

  const mintto_btn = document.getElementById('mintto_btn');  
  mintto_btn.addEventListener('click', mintTo);

  const init_staking_btn = document.getElementById('init_staking_btn');  
  init_staking_btn.addEventListener('click', initStaking);

  const init_state_btn = document.getElementById('init_state_btn');  
  init_state_btn.addEventListener('click', initStakingState);

  const staking_btn = document.getElementById('staking_btn');  
  staking_btn.addEventListener('click', Staking);

  const unstaking_btn = document.getElementById('unstaking_btn');  
  unstaking_btn.addEventListener('click', Unstaking); 

  const pda_state_btn = document.getElementById('pda_state_btn');  
  pda_state_btn.addEventListener('click', statRefresh); 

  const my_state_btn = document.getElementById('my_state_btn');  
  my_state_btn.addEventListener('click', myStat); 

  const fund_btn = document.getElementById('fund_btn');  
  fund_btn.addEventListener('click', Funding);  

  const set_max_apy_btn = document.getElementById('set_max_apy_btn');  
  set_max_apy_btn.addEventListener('click', SetAPYMax);    

  const claim_btn = document.getElementById('claim_btn');  
  claim_btn.addEventListener('click', ClaimReward);    

  

})();
