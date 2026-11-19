// Synthetic API responses in Playwright only. No fixture reaches Next.js or Supabase.
import fs from 'node:fs';
import { loadTs } from '../../scripts/helpers/load-ts.mjs';
import { samplePhoto } from './support.mjs';
const { recommendAccountReflection } = loadTs(new URL('../../src/lib/account-reflection/recommendation-server.ts', import.meta.url));
const { activityEffect } = loadTs(new URL('../../src/lib/account-activity/model.ts', import.meta.url));
const { ALL_GARDEN_ITEMS } = loadTs(new URL('../../src/app/shop-catalog.ts', import.meta.url));
const defaultOwner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project = 'yhzgucbiwvizjxpzwpqg';
export function fixture(initialStage = 'checkin', initialPhoto = false, owner = defaultOwner) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const now = new Date().toISOString(), row = { user_id: owner, record_date: date };
  const day = { project, userId:owner, date, today:date, sunshineBalance:0,
    record:{...row, answers:['','','',''], stage:'checkin', plant_state:'normal', note:'', photo_comment:'', recommendation_title:null,revision:0}, cares:[], rewards:[] };
  const garden = { project,userId:owner,today:date,profile:{user_id:owner,display_name:'',timezone:'Asia/Seoul'},
    garden:{user_id:owner,main_character:'sprout',sunshine_balance:0,active_days:0,growth_stage:0,layout_revision:0},
    inventory:['sprout','default-sky'].map(item_id=>({user_id:owner,item_id,source:'default',acquired_at:now})),
    placements:[{user_id:owner,slot_id:'background',item_id:'default-sky'}],growthGrants:[],todayRecord:null };
  const addReward = (reason,delta) => { day.rewards.push({...row,event_key:date+':'+reason,reason,delta,policy_version:1});day.sunshineBalance+=delta; };
  const commit = () => {
    const recommendation = recommendAccountReflection(day, []);
    day.record.stage='photo';day.record.revision++;day.record.recommendation_title=recommendation.title;
    day.cares=recommendation.ids.map((care_id,i)=>({...row,position:i+1,care_id,catalog_version:2,completed_at:null}));addReward('reflection',10);
  };
  if(initialStage!=='checkin'){day.record.answers=['normal','normal','normal','normal'];day.record.revision=4;commit();}
  if(initialStage==='growth'||initialStage==='care'){day.record.stage='growth';day.record.revision++;}
  if(initialStage==='care'){day.record.stage='care';day.record.revision++;addReward('participation',5);}
  const state={hasPhoto:initialPhoto,writingFailure:false,writingDelay:0,commerceEnabled:false,commerceFailure:false,commerceLost:false,commerceDelay:0};
  const catalog=ALL_GARDEN_ITEMS.map(i=>({id:i.id,price:i.price,default_owned:!!i.defaultOwned,reward_days:i.rewardDays??null})),purchases=[],ledger=[];
  const commerce=()=>{garden.garden.sunshine_balance=day.sunshineBalance;return {enabled:state.commerceEnabled,garden,catalog,purchases,ledger};};
  const user={id:owner,email:'browser-fixture@example.invalid',aud:'authenticated',role:'authenticated',created_at:now,app_metadata:{provider:'email'},user_metadata:{}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const session={access_token:[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:owner,exp,role:'authenticated',iss:`https://${project}.supabase.co/auth/v1`})).toString('base64url'),'fixture-not-valid-on-server'].join('.'),refresh_token:'fixture-only',expires_at:exp,expires_in:3600,token_type:'bearer',user};
  const auth={owner,session,storageKey:`sb-${project}-auth-token`};
  const json=(data,status=200)=>({status,contentType:'application/json',body:JSON.stringify(data)});
  const route=async(url,method,request)=>{
    const p=url.pathname;
    if(method==='GET'){
      if(p==='/api/account/commerce')return json(commerce());
      if(p==='/api/account/garden'){garden.garden.sunshine_balance=day.sunshineBalance;return json(garden);}
      if(p==='/api/account/records')return json(url.searchParams.has('month')?{userId:owner,today:date,month:url.searchParams.get('month'),dates:[date]}:day);
      if(['/api/account/writing','/api/account/activity','/api/account/reflection/commit'].includes(p))return json({enabled:true,today:date});
      if(p==='/api/account/photos')return url.searchParams.has('image')?{status:state.hasPhoto?200:404,contentType:'image/png',body:state.hasPhoto?fs.readFileSync(samplePhoto):Buffer.from('')} : json({date,today:date,hasPhoto:state.hasPhoto,revision:day.record.revision,stage:day.record.stage});
    }
    if(p==='/api/account/commerce'&&method==='POST'){
      if(!state.commerceEnabled)return json({error:'commerce-disabled'},403);
      if(state.commerceDelay)await new Promise(resolve=>setTimeout(resolve,state.commerceDelay));
      if(state.commerceFailure)return json({error:'commerce-read-before-retry'},503);
      const input=request.postDataJSON();
      if(input.balance!==day.sunshineBalance||input.revision!==garden.garden.layout_revision)return json({error:'commerce-conflict'},409);
      if(input.action==='purchase'){
        const item=catalog.find(i=>i.id===input.item);if(!item||item.price>day.sunshineBalance)return json({error:'insufficient-sunshine'},409);
        if(!garden.inventory.some(i=>i.item_id===input.item)){
          day.sunshineBalance-=item.price;garden.inventory.push({user_id:owner,item_id:input.item,source:'purchase',acquired_at:now});
          purchases.push({item_id:input.item,cost:item.price,event_key:'purchase:'+input.item});ledger.push({item_id:input.item,delta:-item.price,event_key:'purchase:'+input.item});
        }
      }else{
        garden.placements=Object.entries(input.layout).map(([slot_id,item_id])=>({user_id:owner,slot_id,item_id}));garden.garden.layout_revision++;
      }
      return state.commerceLost?json({error:'commerce-read-before-retry'},503):json(commerce());
    }
    if(method==='POST' && p==='/api/account/reflection/draft'){const input=request.postDataJSON();day.record.answers=input.answers;day.record.revision++;return json({project,userId:owner,date,changed:true,revision:day.record.revision});}
    if(method==='POST' && p==='/api/account/reflection/commit'){commit();return json({day,recovered:false});}
    if(method==='POST' && p==='/api/account/photos'){state.hasPhoto=true;day.record.revision++;return json({saved:true,date,revision:day.record.revision});}
    if(method==='PUT' && p==='/api/account/writing'){
      if(state.writingDelay)await new Promise(resolve=>setTimeout(resolve,state.writingDelay));
      if(state.writingFailure)return json({error:'fixture-save-failure'},503);
      const input=request.postDataJSON();if(input.comment!==undefined)day.record.photo_comment=input.comment;if(input.note!==undefined)day.record.note=input.note;day.record.revision++;
      return json({project,userId:owner,date,revision:day.record.revision,note:day.record.note,comment:day.record.photo_comment});
    }
    if(method==='POST' && p==='/api/account/activity'){
      const input=request.postDataJSON(),before=structuredClone(day);
      if(input.action==='care_done'){
        const care=day.cares.find(c=>c.care_id===input.careId);
        if(day.record.stage!=='care'||!care)return json({error:'fixture-action-not-allowed'},409);
        if(care.completed_at)return json({day,changed:false,effect:null});
        if(input.revision!==day.record.revision)return json({error:'revision-conflict'},409);
        care.completed_at=new Date().toISOString();
        if(!day.rewards.some(r=>r.reason==='firstCare'))addReward('firstCare',10);
      }else if(input.action==='photo_done')day.record.stage='growth';else if(input.action==='growth_done'){day.record.stage='care';addReward('participation',5);}else return json({error:'fixture-action-not-allowed'},403);
      day.record.revision++;
      return json({day,changed:true,effect:activityEffect(before,day,input,true,day.record.revision)});
    }
    return json({error:'fixture-unhandled-request'},403);
  };
  return {auth,state,day,route,user,garden,commerce};
}
