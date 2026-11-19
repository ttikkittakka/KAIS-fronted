import { photoSession } from '../account-photos/client';
import { commerceSchema, sameLayout, type CommerceInput } from './model';
export function createCommerceClient(owner:string,request:typeof fetch=fetch){
  let busy=false,blocked=false,epoch=0;
  const read=async(signal:AbortSignal)=>{
    const response=await request('/api/account/commerce',{headers:await photoSession(owner),cache:'no-store',signal});
    if(!response.ok)throw Error('상점 정보를 불러오지 못했어요.');
    const value=commerceSchema.parse(await response.json());
    if(value.garden.userId!==owner)throw Error('계정이 변경됐어요.');
    await photoSession(owner);return value;
  };
  return {
    dispose(){epoch++;blocked=true;},
    async read(){const run=epoch;const result=await read(AbortSignal.timeout(15000));if(run!==epoch)throw Error('계정이 변경됐어요.');if(!busy)blocked=false;return result;},
    async save(input:CommerceInput){
      if(busy||blocked)throw Error('서버 기록을 먼저 다시 확인해 주세요.');
      busy=true;const run=epoch;
      try{
        const signal=AbortSignal.timeout(20000),before=await read(signal);
        if(run!==epoch||!before.enabled)throw Error('지금은 구매·배치 저장을 사용할 수 없어요.');
        if(input.action==='purchase'&&!before.garden.inventory.some(i=>i.item_id===input.item)&&before.catalog.find(i=>i.id===input.item)?.price!==input.price)throw Error('상품 가격이 변경됐어요. 다시 확인해 주세요.');
        const response=await request('/api/account/commerce',{method:'POST',headers:{...await photoSession(owner),'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store',signal});
        if(!response.ok)throw Error('저장 결과를 확인하지 못했어요. 다시 확인 후 진행해 주세요.');
        const ack=commerceSchema.parse(await response.json()),fresh=await read(signal);
        if(run!==epoch||ack.garden.userId!==owner||JSON.stringify(ack)!==JSON.stringify(fresh))throw Error('저장 결과가 달라졌어요. 서버 기록을 다시 확인해 주세요.');
        if(input.action==='purchase'){
          const owned=before.garden.inventory.some(i=>i.item_id===input.item),price=before.catalog.find(i=>i.id===input.item)?.price;
          if(price===undefined||!fresh.garden.inventory.some(i=>i.item_id===input.item)||fresh.garden.garden.sunshine_balance!==before.garden.garden.sunshine_balance-(owned?0:price))throw Error('구매 결과를 확인하지 못했어요.');
        }else{
          const previous=Object.fromEntries(before.garden.placements.map(p=>[p.slot_id,p.item_id]));
          if(!sameLayout(input.layout,Object.fromEntries(fresh.garden.placements.map(p=>[p.slot_id,p.item_id])))||fresh.garden.garden.layout_revision!==before.garden.garden.layout_revision+(sameLayout(previous,input.layout)?0:1)||fresh.garden.garden.sunshine_balance!==before.garden.garden.sunshine_balance)throw Error('배치 결과를 확인하지 못했어요.');
        }
        return fresh;
      }catch(error){blocked=true;try{await read(AbortSignal.timeout(10000));}catch{/* No automatic mutation retry. */}throw error;}
      finally{busy=false;}
    },
  };
}
