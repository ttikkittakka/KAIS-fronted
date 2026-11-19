import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { handleGardenRequest } from '../account-garden/server';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { validateGardenLayout } from '../../app/garden-layout';
import { shopItem } from '../../app/shop-catalog';
import { commerceInput, commerceSchema, sameLayout } from './model';

// Approved development A/B user-click flow. Production always remains closed.
const DEVELOPMENT_COMMERCE_ENABLED=true;
export function createCommerceHandler(enabled=()=>DEVELOPMENT_COMMERCE_ENABLED){
  return async(request:Request)=>{
    if(!['GET','POST'].includes(request.method))return reply(405,{error:'method-not-allowed'});
    if(new URL(request.url).search)return reply(400,{error:'unexpected-input'});
    try{
      const auth=await authenticateAccount(request);if(auth instanceof Response)return auth;
      const allowed=process.env.NODE_ENV==='development'&&isApprovedDraftTester(auth.userId)&&enabled();
      const read=async()=>{
        const [garden,catalog,purchases,ledger]=await Promise.all([
          handleGardenRequest(new Request(new URL('/api/account/garden',request.url),{headers:request.headers,signal:request.signal})),
          auth.client.from('onestep_item_catalog').select('id,price,default_owned,reward_days').order('id'),
          auth.client.from('onestep_purchases').select('user_id,item_id,cost,event_key').eq('user_id',auth.userId).order('item_id'),
          auth.client.from('onestep_sunshine_ledger').select('user_id,item_id,delta,event_key').eq('user_id',auth.userId).eq('reason','purchase').order('item_id'),
        ]);
        if(!garden.ok||catalog.error||purchases.error||ledger.error||[...purchases.data,...ledger.data].some(r=>r.user_id!==auth.userId))throw Error('commerce-read');
        return commerceSchema.parse({enabled:allowed,garden:await garden.json(),catalog:catalog.data,purchases:purchases.data,ledger:ledger.data});
      };
      if(request.method==='GET')return reply(200,await read());
      if(!allowed)return reply(403,{error:'commerce-disabled'});
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'json-required'});
      const text=await request.text();if(text.length>4096)return reply(413,{error:'input-too-large'});
      let raw;try{raw=JSON.parse(text);}catch{return reply(400,{error:'invalid-input'});}
      const parsed=commerceInput.safeParse(raw);if(!parsed.success)return reply(400,{error:'invalid-input'});
      const input=parsed.data,before=await read(),g=before.garden;
      if(input.action==='purchase'&&g.inventory.some(i=>i.item_id===input.item))return reply(200,before);
      const oldLayout=Object.fromEntries(g.placements.map(p=>[p.slot_id,p.item_id]));
      if(input.action==='layout'&&sameLayout(oldLayout,input.layout))return reply(200,before);
      if(g.garden.layout_revision!==input.revision||g.garden.sunshine_balance!==input.balance)return reply(409,{error:'commerce-conflict'});
      let price=0;
      if(input.action==='purchase'){
        const item=before.catalog.find(i=>i.id===input.item);
        if(!item||!shopItem(input.item)||item.default_owned||item.reward_days!==null||item.price<=0)return reply(400,{error:'item-unavailable'});
        price=item.price;
        if(input.price!==price)return reply(409,{error:'price-changed'});
        if(input.balance<price)return reply(409,{error:'insufficient-sunshine'});
      }else{
        try{validateGardenLayout(input.layout,Object.fromEntries(g.inventory.map(i=>[i.item_id,1])));}catch{return reply(400,{error:'invalid-layout'});}
      }
      if(auth.expiresAt<=Date.now())return reply(401,{error:'authentication-expired'});
      request.signal.throwIfAborted();
      const result=input.action==='purchase'?await auth.client.rpc('onestep_buy_item',{p_item:input.item}):await auth.client.rpc('onestep_save_layout',{p_layout:input.layout,p_revision:input.revision});
      if(result.error)return reply(result.error.code==='40001'?409:503,{error:'commerce-read-before-retry'});
      const after=await read(),next=after.garden;
      if(input.action==='purchase'){
        if(result.data!==input.balance-price||next.garden.sunshine_balance!==input.balance-price||!after.purchases.some(p=>p.item_id===input.item&&p.cost===price)||!sameLayout(oldLayout,Object.fromEntries(next.placements.map(p=>[p.slot_id,p.item_id]))))throw Error('purchase-verification');
      }else if(result.data!==input.revision+1||next.garden.layout_revision!==input.revision+1||next.garden.sunshine_balance!==input.balance||!sameLayout(input.layout,Object.fromEntries(next.placements.map(p=>[p.slot_id,p.item_id])))||JSON.stringify(next.inventory)!==JSON.stringify(g.inventory))throw Error('layout-verification');
      return reply(200,after);
    }catch{return reply(503,{error:'commerce-read-before-retry'});}
  };
}
export const handleCommerce=createCommerceHandler();
