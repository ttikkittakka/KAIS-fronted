// One dedicated connection, SELECT 1 only. No role, claims, BEGIN, commit API or v2 RPC.
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {loadTs} from './helpers/load-ts.mjs';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {accountPoolConfig}=loadTs(new URL('../src/lib/account/db-pool.ts',import.meta.url));
const {classifyDbError}=loadTs(new URL('../src/lib/account/db-diagnostics.ts',import.meta.url));
let stage='pool-configuration',pool,client;
const started=performance.now();
try{
 const config=accountPoolConfig(process.env);
 console.log(JSON.stringify({context:'isolated-node-not-next-server',passwordPresent:!!config.password,caPresent:!!config.ssl.ca,configurationValid:true}));
 stage='pool-construction';pool=new Pool(config);pool.on('error',()=>{});
 stage='connect';client=await pool.connect();
 stage='readonly-select';await client.query('SELECT 1');
 console.log(JSON.stringify({stage,success:true,transactionBegan:false}));
}catch(error){console.log(JSON.stringify({stage,success:false,elapsedMs:Math.round(performance.now()-started),chain:classifyDbError(error),transactionBegan:false}));process.exitCode=1;}
finally{client?.release(true);await pool?.end();}
