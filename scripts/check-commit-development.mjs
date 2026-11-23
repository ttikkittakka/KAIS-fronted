import nextEnv from '@next/env';
import { loadTs } from './helpers/load-ts.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {accountPoolConfig}=loadTs(new URL('../src/lib/account/db-pool.ts',import.meta.url));
let stage='development-mode';
try {
 if(process.env.NODE_ENV!=='development')throw Error();
 stage='pool-configuration';
 accountPoolConfig(process.env);
 const secret=process.env.ONESTEP_DB_PASSWORD;
 stage='public-environment';
 if(Object.entries(process.env).some(([k,v])=>k.startsWith('NEXT_PUBLIC_') && v && (k.includes('ONESTEP_DB')||v.includes(secret)||v.includes('BEGIN CERTIFICATE')||v.includes(process.env.ONESTEP_DB_USER))))throw Error();
 stage='approved-ab-configuration';
 const ab=readFileSync('.env.onestep-ab-680b6be6-742e-44c9-bd7b-dc17ef6c1525-run.local','utf8');
 const get=k=>ab.match(new RegExp('^'+k+'=(.*)$','m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
 const ids=['A','B'].map(k=>get('ONESTEP_AB_USER_ID_'+k));
 if(ids.some(id=>!id)||new Set(ids).size!==2||[...ids].sort().join(',')!==(process.env.ONESTEP_DRAFT_TEST_USER_IDS??'').split(',').map(x=>x.trim()).sort().join(','))throw Error();
 const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
 stage='git-tracked-files';
 if(tracked.some(p=>p.endsWith('commit-password.dpapi')))throw Error();
 let numericSubstringMatches=0;
 const scan=files=>{for(const file of files){if(!existsSync(file))continue;const text=readFileSync(file).toString('utf8');
  for(let at=text.indexOf(secret);at!==-1;at=text.indexOf(secret,at+secret.length)){
   // A digit sequence embedded in a longer numeric token is not a credential assignment.
   if(/^\d+$/.test(secret) && (/\d/.test(text[at-1]??'') || /\d/.test(text[at+secret.length]??''))){numericSubstringMatches++;continue;}
   throw Error();
  }
 }};
 scan(tracked);
 stage='existing-client-bundles';
 let bundleFiles=0;
 const walk=dir=>{if(!existsSync(dir))return;for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else{
  scan([p]);
  if(/ONESTEP_DB_|onestep_app_login_v\d+|BEGIN CERTIFICATE|commit-password\.dpapi/.test(readFileSync(p,'utf8')))throw Error();
  bundleFiles++;
 }}};
 walk('.next/static');walk('.next/dev/static');
 stage='local-logs';
 const logs=dir=>{if(!existsSync(dir))return;for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())logs(p);else if(/\.(log|txt)$/.test(p))scan([p]);}};
 logs('.env.phase3b-ab');logs('.next/dev/logs');
 console.log(JSON.stringify({standaloneCredentialMatches:0,numericSubstringMatches,clientBundleFilesScanned:bundleFiles}));
 console.log('Development server configuration valid; no database connection; commit remains disabled.');
}catch{console.error(JSON.stringify({checkFailed:stage,details:'suppressed'}));process.exitCode=1;}
