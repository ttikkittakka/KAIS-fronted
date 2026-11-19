// Read-only RPCs only. No commit/activity/start/draft RPC and no database password.
import {readFileSync,existsSync} from 'node:fs';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {loadTs} from './helpers/load-ts.mjs';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {parseCareHistory}=loadTs(new URL('../src/app/daily-cares.ts',import.meta.url));
const {adaptAccountSnapshot}=loadTs(new URL('../src/lib/account-records/snapshot.ts',import.meta.url));
const {recommendAccountReflection}=loadTs(new URL('../src/lib/account-reflection/recommendation-server.ts',import.meta.url));
const source=readFileSync('.env.onestep-ab-680b6be6-742e-44c9-bd7b-dc17ef6c1525-run.local','utf8');
const get=k=>source.match(new RegExp('^'+k+'=(.*)$','m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
const project='yhzgucbiwvizjxpzwpqg', ids=['A','B'].map(k=>get('ONESTEP_AB_USER_ID_'+k));
const equal=(a,b)=>[...a].sort().join(',')===[...b].sort().join(',');
let stage='approved-ab-configuration';
try{
 const args=process.argv.slice(2);
 if(args.length>1 || (args.length===1 && args[0]!=='--account=A'))throw Error();
 if(get('ONESTEP_AB_APPROVED_PROJECT')!==project || ids.some(id=>!id)||new Set(ids).size!==2 || !equal(ids,(process.env.ONESTEP_DRAFT_TEST_USER_IDS??'').split(',').map(x=>x.trim())))throw Error();
 console.log(JSON.stringify({approvedABConfigured:true,selectedA:process.env.ONESTEP_COMMIT_TEST_USER_ID===ids[0],testDate:process.env.ONESTEP_COMMIT_TEST_DATE??null,trialAlreadyReserved:existsSync('.env.phase3b-ab/commit-trial.attempt'),stopMarkerPresent:existsSync('.env.phase3b-ab/commit-test.stop')}));
 for(const label of args.length?['A']:['A','B']){
  stage=label+'-authentication';
  const client=createClient(`https://${project}.supabase.co`,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{
   if(existsSync('.env.phase3b-ab/commit-test.stop'))throw Error();
   const response=await fetch(url,{...init,signal:AbortSignal.timeout(2000)});
   if(!response.ok)throw Error();return response;
  }}});
  try{
   const auth=await client.auth.signInWithPassword({email:get('ONESTEP_AB_EMAIL_'+label),password:get('ONESTEP_AB_PASSWORD_'+label)});
   if(auth.error||auth.data.user?.id!==get('ONESTEP_AB_USER_ID_'+label))throw Error();
   const id=auth.data.user.id;
   stage=label+'-snapshot';
   const result=await client.rpc('onestep_get_day');if(result.error)throw Error();
   const today=result.data.today, day=adaptAccountSnapshot(result.data,id,today,[today]);
   if(!day.record||day.record.stage!=='checkin'||day.record.answers.some(x=>!x)){
    console.log(JSON.stringify({account:label,serverToday:today,ready:false,reason:!day.record?'today-record-missing':day.record.stage!=='checkin'?'already-committed':'today-answers-incomplete',stage:day.record?.stage??null,revision:day.record?.revision??null,savedAnswerCount:day.record?.answers.filter(Boolean).length??0,savedCareCount:day.cares.length,reflectionLedgerCount:day.rewards.filter(r=>r.reason==='reflection').length,sunshineBalance:day.sunshineBalance,writes:0}));continue;
   }
   const previous=[];
   stage=label+'-history';
   for(let age=1;age<=3;age++){
    const date=new Date(Date.parse(today)-age*86400000).toISOString().slice(0,10);
    const r=await client.rpc('onestep_get_day',{p_date:date});if(r.error)throw Error();
    previous.push(adaptAccountSnapshot(r.data,id,date,[today]));
   }
   const recommendation=recommendAccountReflection(day,previous);
   if(recommendation.ids.length!==3||new Set(recommendation.ids).size!==3||parseCareHistory([recommendation]).length!==1)throw Error();
   const latest=await client.rpc('onestep_get_day');if(latest.error)throw Error();
   const fresh=adaptAccountSnapshot(latest.data,id,today,[today]);
   if(fresh.record?.revision!==day.record.revision||fresh.record.stage!=='checkin'||fresh.record.answers.some((v,i)=>v!==day.record.answers[i]))throw Error();
   console.log(JSON.stringify({account:label,serverToday:today,revision:day.record.revision,stage:day.record.stage,fourSavedAnswers:true,recommendationCount:3,distinctRecommendations:true,catalogValid:true,recommendationTitleStored:day.record.recommendation_title!==null,totalLedgerCount:day.rewards.length,savedCareCount:day.cares.length,reflectionLedgerCount:day.rewards.filter(r=>r.reason==='reflection').length,sunshineBalance:day.sunshineBalance,writes:0}));
  }finally{await client.auth.signOut({scope:'local'});}
 }
}catch{console.error(JSON.stringify({error:'READ_ONLY_PREFLIGHT_FAILED',stage,details:'suppressed',writes:0}));process.exitCode=1;}
