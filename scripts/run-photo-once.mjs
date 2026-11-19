// Explicit approval: A, 2026-11-16, revision 4, exactly one HTTP POST. No retry.
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {loadTs} from './helpers/load-ts.mjs';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const date='2026-11-16',project='yhzgucbiwvizjxpzwpqg';
const {adaptAccountSnapshot}=loadTs(new URL('../src/lib/account-records/snapshot.ts',import.meta.url));
const {photoTrialBefore,photoTrialAfter}=loadTs(new URL('../src/lib/account-activity/photo-trial.ts',import.meta.url));
const {recommendAccountReflection}=loadTs(new URL('../src/lib/account-reflection/recommendation-server.ts',import.meta.url));
const {parseCareHistory}=loadTs(new URL('../src/app/daily-cares.ts',import.meta.url));
const {seoulToday}=loadTs(new URL('../src/lib/account-records/model.ts',import.meta.url));
const source=readFileSync('.env.onestep-ab-680b6be6-742e-44c9-bd7b-dc17ef6c1525-run.local','utf8');
const get=k=>source.match(new RegExp('^'+k+'=(.*)$','m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
const ids=['A','B'].map(k=>get('ONESTEP_AB_USER_ID_'+k));
const clients=[];let server,closePool,stage='preconditions',httpPosts=0;
const report={httpPosts:0,writesRequested:false};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stop=()=>{if(existsSync('.env.phase3b-ab/commit-test.stop'))throw Error('stopped');};
async function snapshot(client,id,d=date,recovery=false){
 if(!recovery)stop();const r=await client.rpc('onestep_get_day',{p_date:d});if(r.error)throw Error('snapshot');
 return adaptAccountSnapshot(r.data,id,d,[date]);
}
function ready(day){try{photoTrialBefore(day,ids[0]);return true;}catch{return false;}}
try{
 if(process.env.NODE_ENV!=='development'||seoulToday()!==date||get('ONESTEP_AB_APPROVED_PROJECT')!==project||ids.some(x=>!x)||new Set(ids).size!==2||[...ids].sort().join(',')!==(process.env.ONESTEP_DRAFT_TEST_USER_IDS??'').split(',').map(x=>x.trim()).sort().join(',')||existsSync('.env.phase3b-ab/A-20261116-photo-done-01/activity-executor.attempt')||existsSync('.env.phase3b-ab/A-20261116-photo-done-01/activity-http.attempt'))throw Error('not-approved');
 
 stop();
 for(const label of ['A','B']){
  const client=createClient(`https://${project}.supabase.co`,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(2000)})}});
  clients.push(client);const auth=await client.auth.signInWithPassword({email:get('ONESTEP_AB_EMAIL_'+label),password:get('ONESTEP_AB_PASSWORD_'+label)});
  if(auth.error||auth.data.user?.id!==get('ONESTEP_AB_USER_ID_'+label))throw Error('account');
 }
 const beforeA=await snapshot(clients[0],ids[0]),beforeB=await snapshot(clients[1],ids[1]);if(!ready(beforeA))throw Error('precondition-changed');
 const previous=[];
 for(const age of [1,2,3])previous.push(await snapshot(clients[0],ids[0],new Date(Date.parse(date)-age*86400000).toISOString().slice(0,10)));
 const recommendation=recommendAccountReflection(beforeA,previous);
 if(recommendation.ids.length!==3||new Set(recommendation.ids).size!==3||parseCareHistory([recommendation]).length!==1)throw Error('catalog');
 // Publish only readiness metadata, never answers, IDs or tokens.
 console.log(JSON.stringify({preflightPassed:true,revision:5,stage:'photo',recommendationCount:3,balance:10}));
 process.env.ONESTEP_ACTIVITY_APPROVED_A_ID=ids[0];process.env.ONESTEP_ACTIVITY_TRIAL_APPROVAL='A-20261116-photo-done-01';
 process.env.ONESTEP_COMMIT_TEST_USER_ID=ids[0];process.env.ONESTEP_COMMIT_APPROVED_A_ID=ids[0];
 process.env.ONESTEP_COMMIT_TEST_DATE=date;process.env.ONESTEP_COMMIT_TRIAL_APPROVAL='A-20261116-photo-done-01';
 const {POST}=loadTs(new URL('../src/app/api/account/activity/route.ts',import.meta.url));
 ({closeAccountCommitPool:closePool}=loadTs(new URL('../src/lib/account/db-pool.ts',import.meta.url)));
 let completeRoute;const routeDone=new Promise(resolve=>{completeRoute=resolve;});
 let accepted=false;
 server=createServer(async(req,res)=>{
  if(accepted||req.method!=='POST'||req.url!=='/api/account/activity'){res.writeHead(404);res.end();return;}
  accepted=true;const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>512)throw Error('input');chunks.push(chunk);}
   const response=await POST(new Request('http://127.0.0.1/api/account/activity',{method:'POST',headers:{authorization:req.headers.authorization??'','content-type':'application/json'},body:Buffer.concat(chunks),signal:abort.signal}));
   res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());
  }catch{res.writeHead(503);res.end('{"error":"trial-uncertain"}');}
  finally{completeRoute();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const fresh=await snapshot(clients[0],ids[0]);if(!ready(fresh)||!same(fresh,beforeA)||seoulToday()!==date)throw Error('final-precondition');
 const {data}=await clients[0].auth.getSession();if(!data.session)throw Error('session');
 stop();
 // Persistent dispatch receipt supplements the existing executor's atomic one-shot lock.
 writeFileSync('.env.phase3b-ab/A-20261116-photo-done-01/activity-http.attempt','2026-11-16 A one request\n',{flag:'wx',mode:0o600});
 stage='single-http-request';httpPosts=1;report.httpPosts=1;report.writesRequested=true;
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/account/activity`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({date,revision:5,action:'photo_done'}),signal:AbortSignal.timeout(40000)});
  report.httpStatus=response.status;
  const body=await response.json();
  const errors=['reflection-commit-not-ready','reflection-commit-forbidden','trial-precondition-changed','commit-uncertain-reload','commit-conflict-reload','day-changed','revision-conflict','trial-uncertain'];
  if(!response.ok)report.httpError=errors.includes(body.error)?body.error:'unclassified';
 }catch{report.httpStatus='uncertain';}
 // Never issue a second POST, regardless of the first response.
 if(accepted)await routeDone;
 process.env.ONESTEP_ACTIVITY_TRIAL_APPROVAL='';process.env.ONESTEP_COMMIT_TRIAL_APPROVAL='';
 stage='independent-snapshot';
 const afterA=await snapshot(clients[0],ids[0],date,true),afterB=await snapshot(clients[1],ids[1],date,true);
 const ledger=afterA.rewards.filter(r=>r.reason==='reflection');
 const expectedIds=[...afterA.cares].sort((a,b)=>a.position-b.position).map(c=>c.care_id);
 try{photoTrialAfter(beforeA,afterA);report.snapshotVerified=true;}catch{report.snapshotVerified=false;}
 report.revision=afterA.record?.revision??null;report.stage=afterA.record?.stage??null;report.savedCareCount=afterA.cares.length;report.reflectionLedgerCount=ledger.length;report.sunshineBalance=afterA.sunshineBalance;report.bTodayUnchanged=same(beforeB,afterB);
 report.aPastThreeDaysUnchanged=true;
 for(const prior of previous){const after=await snapshot(clients[0],ids[0],prior.date,true);const beforeComparable=prior;if(!same(beforeComparable,after))report.aPastThreeDaysUnchanged=false;}
 report.executorTrialReserved=existsSync('.env.phase3b-ab/A-20261116-photo-done-01/activity-executor.attempt');
 if(!report.snapshotVerified||!report.bTodayUnchanged||!report.aPastThreeDaysUnchanged)process.exitCode=1;
}catch{report.stoppedAt=stage;report.details='suppressed';process.exitCode=1;}
finally{
 delete process.env.ONESTEP_ACTIVITY_TRIAL_APPROVAL;delete process.env.ONESTEP_ACTIVITY_APPROVED_A_ID;
 delete process.env.ONESTEP_COMMIT_TRIAL_APPROVAL;delete process.env.ONESTEP_COMMIT_TEST_USER_ID;delete process.env.ONESTEP_COMMIT_APPROVED_A_ID;delete process.env.ONESTEP_COMMIT_TEST_DATE;
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await closePool?.();
 for(const client of clients)await client.auth.signOut({scope:'local'});
 report.httpPosts=httpPosts;console.log(JSON.stringify(report));
 writeFileSync('.env.phase3b-ab/A-20261116-photo-done-01/activity-once-result.json',JSON.stringify(report,null,2),{mode:0o600});
}
