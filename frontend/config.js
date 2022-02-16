import * as web3 from "@solana/web3.js";
const anchor = require('@project-serum/anchor');
import config from './src/config.json';
export const URL = config.url;
export const programId = new web3.PublicKey(config.program);
