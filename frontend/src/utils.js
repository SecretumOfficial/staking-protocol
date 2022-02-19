const anchor = require('@project-serum/anchor');
const spl_token = require('@solana/spl-token');

async function performInstructions(connection, signer, insts, signers = null){
    let trx = new anchor.web3.Transaction().add(...insts);
    trx.feePayer = signer.publicKey;
    trx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;

    if(signers != null)
    {
        trx.partialSign(...signers);
    }
        
   
    let signed = await signer.signTransaction(trx, signers);

    const transactionSignature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: true }
    );

    let confirmRes = await connection.confirmTransaction(transactionSignature);
    if(confirmRes.value.err==null)
    {
        return [true, null];
    }
    else
    {
        console.log(confirmRes.value.err);
        return [false, confirmRes.value.err];
    } 
}

async function createWallet(connection, wallet, lamports){
    let bal = await connection.getBalance(wallet);
    if (bal < lamports) {
        const sig = await connection.requestAirdrop(wallet, lamports - bal);
        await connection.confirmTransaction(sig);
        bal = await connection.getBalance(wallet);
    }
    return wallet;
}

async function createAccount(connection, signer, space, progId = undefined)
{
    const newAccount = anchor.web3.Keypair.generate();
    const balanceNeeded = await connection.getMinimumBalanceForRentExemption(space);
    let instructions = [];
    const inst = anchor.web3.SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: balanceNeeded,
        space: space,
        programId: progId !=null? progId: spl_token.TOKEN_PROGRAM_ID
      });      

    instructions.push(inst);
    const res = await performInstructions(connection, signer, instructions, [newAccount]);
    if(res[0])
        return newAccount.publicKey;
    return null;
}


async function createToken(connection, signer, decimals)
{
    const mintAccount = anchor.web3.Keypair.generate();
    const balanceNeeded = await spl_token.Token.getMinBalanceRentForExemptMint(connection);
    let instructions = [];

    instructions.push(anchor.web3.SystemProgram.createAccount({
      fromPubkey: signer.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: balanceNeeded,
      space: 82, //MintLayout.span,
      programId: spl_token.TOKEN_PROGRAM_ID
    }));

    instructions.push(spl_token.Token.createInitMintInstruction(
        spl_token.TOKEN_PROGRAM_ID, 
        mintAccount.publicKey, 
        decimals, 
        signer.publicKey, signer.publicKey));

    const res = await performInstructions(connection, signer, instructions, [mintAccount]);

    if(res[0])
    {
        const token = new spl_token.Token(
            connection,
            mintAccount.publicKey,
            spl_token.TOKEN_PROGRAM_ID,
            signer.publicKey
        );        
        return token;
    }

    return null;
}

async function getAssociatedTokenAddress(mintAddr, owner, allowOwnerOffCurve=false)
{
    const mint = new spl_token.Token(
        null,
        mintAddr,
        spl_token.TOKEN_PROGRAM_ID,
        null
      );

    let acc = await  spl_token.Token.getAssociatedTokenAddress(
        mint.associatedProgramId,
        spl_token.TOKEN_PROGRAM_ID,
        mintAddr,
        owner, allowOwnerOffCurve);
    return acc;
}

async function createAssociatedTokenAccount(connection, mintAddr, signer, owner, allowOwnerOffCurve=false)
{
    const mint = new spl_token.Token(
        connection,
        mintAddr,
        spl_token.TOKEN_PROGRAM_ID,
        signer.publicKey
      );

    let acc = await  spl_token.Token.getAssociatedTokenAddress(
        mint.associatedProgramId,
        spl_token.TOKEN_PROGRAM_ID,
        mintAddr,
        owner, allowOwnerOffCurve);
    
    const accInfo = await connection.getAccountInfo(acc);
    if(accInfo == null)
    {
        console.log("creating associated account");
        let inst  = spl_token.Token.createAssociatedTokenAccountInstruction(
            mint.associatedProgramId,
            spl_token.TOKEN_PROGRAM_ID,
            mintAddr, acc, owner, 
            signer.publicKey);

        let instructions = [];            
        instructions.push(inst);
        const res = await performInstructions(connection, signer, instructions);
        if(res[0])
            return acc;
        return null;
    }
    return acc;
}

async function createTokenAccount(connection, mintAddr, signer, owner)
{
    const mint = new spl_token.Token(
        connection,
        mintAddr,
        spl_token.TOKEN_PROGRAM_ID,
        signer.publicKey
      );

    let instructions = [];
    const newAcc = anchor.web3.Keypair.generate();
    const balanceNeeded = await spl_token.Token.getMinBalanceRentForExemptMint(connection);

    instructions.push(anchor.web3.SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: newAcc.publicKey,
        lamports: balanceNeeded,
        space: 165, //TokenAccountLayout.span,
        programId: spl_token.TOKEN_PROGRAM_ID
    }));

    const res = await performInstructions(connection, signer, instructions, [newAcc]);
    if(!res[0])
        return;
    

    instructions = [];
    instructions.push(spl_token.Token.createInitAccountInstruction(
        spl_token.TOKEN_PROGRAM_ID, 
        mintAddr, newAcc.publicKey, owner));
    

    const res1 = await performInstructions(connection, signer, instructions);
  
    if(res1[0])
        return newAcc.publicKey;

    return null;
}

async function getTokenBalance(connection, mintAddr, signer, addr){
    const mint = new spl_token.Token(
        connection,
        mintAddr,
        spl_token.TOKEN_PROGRAM_ID,
        signer.publicKey
      );

    let acc = await mint.getAccountInfo(addr);    
    return acc.amount.toNumber();
}

async function mintTo(connection, mintAddr, tokenAddr, amount, signer)
{
    let instructions = [];
    instructions.push(
        spl_token.Token.createMintToInstruction(spl_token.TOKEN_PROGRAM_ID,
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
        spl_token.Token.createTransferInstruction(
            spl_token.TOKEN_PROGRAM_ID,
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

module.exports = {
    performInstructions,
    getAssociatedTokenAddress,
    createWallet,
    createAccount,
    createToken,
    createAssociatedTokenAccount,
    createTokenAccount,
    mintTo,
    getTokenBalance,
    transferToken
};



