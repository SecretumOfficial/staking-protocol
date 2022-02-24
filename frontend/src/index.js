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
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);

  const reward_percent = document.getElementById("reward_percent").value;
  const reward_period = document.getElementById("reward_period").value;
  const res = await lib.initialize(program, connection,
    reward_percent, reward_period, mintPublicKey, provider);

  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    document.getElementById("staking_address").value = res[0];
  }
}

const initStakingState = async () => {
  const pda = new web3.PublicKey(document.getElementById('staking_address').value);
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);

  const res = await lib.initializeStakeState(program, connection, pda, provider);

  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    document.getElementById("state_address").value = res[0];
  }
}

const Staking = async () => {
  const pda = new web3.PublicKey(document.getElementById('staking_address').value);
  const state = new web3.PublicKey(document.getElementById('state_address').value);  
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const stake_amount = Number(document.getElementById('stake_amount').value);

  const res = await lib.staking(program, connection, pda, state, stake_amount, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await stat_refresh();
    await myStat();
  }
}

const Unstaking = async () => {
  const pda = new web3.PublicKey(document.getElementById('staking_address').value);
  const state = new web3.PublicKey(document.getElementById('state_address').value);  
  const connection = new web3.Connection(URL, 'confirmed');
  const provider = await getProvider();
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const stake_amount = Number(document.getElementById('stake_amount').value);

  const res = await lib.unstaking(program, connection, pda, state, stake_amount, provider);
  if(res[0] == null)
  {
    alert(res[1]);
  }else{
    await stat_refresh();
    await myStat();
  }
}


const stat_refresh = async () => {
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const pda = new anchor.web3.PublicKey(document.getElementById("staking_address").value);
  let stakingData = await program.account.stakingData.fetch(pda);

  document.getElementById('total_staked').innerHTML = stakingData.totalStaked.toNumber();
  document.getElementById('reward_percent1').innerHTML = stakingData.rewardPercent;
  document.getElementById('reward_period1').innerHTML = stakingData.rewardPeriodInSec;  

  document.getElementById('rewarder_balance').innerHTML = stakingData.rewarderBalance.toNumber();
  document.getElementById('total_funded').innerHTML = stakingData.totalFunded;
  document.getElementById('total_reward_paid').innerHTML = stakingData.totalRewardPaid;
}


const myStat = async () => {
  const pda = new web3.PublicKey(document.getElementById('staking_address').value);
  const state = new web3.PublicKey(document.getElementById('state_address').value);  
  const connection = new web3.Connection(URL, 'confirmed');
  const anchor_provider = await getAnchorProvider();
  const program = new anchor.Program(tokenlockIdl, programId, anchor_provider);
  const stateData = await program.account.stakingState.fetch(state);

  document.getElementById('my_staked').innerHTML = stateData.totalStaked.toNumber();
  document.getElementById('my_rewarded').innerHTML = stateData.totalRewarded.toNumber();
  document.getElementById('last_staked').innerHTML = stateData.lastStaked.toNumber();
  document.getElementById('last_rewarded').innerHTML = stateData.lastRewarded.toNumber();
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
  pda_state_btn.addEventListener('click', stat_refresh); 

  const my_state_btn = document.getElementById('my_state_btn');  
  my_state_btn.addEventListener('click', myStat); 

})();
