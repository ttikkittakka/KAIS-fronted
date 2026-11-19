import {test,expect} from '@playwright/test';
import {account,readAccount,fingerprint,installSession,guard,ready,capture,writeAudit,baseURL} from './support.mjs';

// An isolated read-only automation context; never handed to a user for buying.
test('live enabled commerce: confirmation and inventory navigation without purchase',async({browser},info)=>{
 for(const role of ['A','B']){
  for(const login of [1,2]){
  const auth=await account(role,login===2),before=await readAccount(auth,'/api/account/commerce');
  expect(before.enabled).toBe(true);
  const context=await browser.newContext({...info.project.use,baseURL}),audit=await guard(context);
  await installSession(context,auth);
  try{
   const page=await context.newPage();await page.goto(baseURL);await ready(page);
   await page.reload();await ready(page);
   for(const placement of before.garden.placements.filter(p=>p.slot_id!=='background')){
    await expect(page.locator(`.garden-placements [data-slot="${placement.slot_id}"]`)).toBeVisible();
   }
   await capture(page,info,role+'-restored-garden');
   await page.getByRole('button',{name:'상점',exact:true}).click();
   await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'꾸미기',exact:true}).click();
   await page.locator('.shop-card').filter({hasText:'노란 꽃'}).click();
   const price=before.catalog.find(i=>i.id==='yellow-flower').price,balance=before.garden.garden.sunshine_balance;
   await expect(page.locator('#item-title')).toHaveText('노란 꽃');
   const details=page.locator('.shop-price dd');
   if(!before.garden.inventory.some(i=>i.item_id==='yellow-flower')){
    await expect(details.nth(0)).toContainText(String(price));await expect(details.nth(1)).toContainText(String(balance));
    if(balance>=price){await expect(details.nth(2)).toContainText(String(balance-price));await expect(page.locator('.shop-detail .primary-button')).toBeEnabled();}
    else await expect(page.locator('.shop-detail .primary-button')).toBeDisabled();
   }else{await expect(page.locator('.shop-owned')).toContainText('보유 중');await expect(details).toHaveCount(0);}
   // No click on purchase confirmation, even though A's button is enabled.
   await capture(page,info,role+'-purchase-confirmation');
   await page.getByRole('button',{name:'보관함 열기',exact:true}).click();
   await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'꾸미기',exact:true}).click();
   const flower=page.locator('.shop-card').filter({hasText:'노란 꽃'});
   await expect(flower).toHaveCount(before.garden.inventory.some(i=>i.item_id==='yellow-flower')?1:0);
   await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'배경',exact:true}).click();
   await page.locator('.shop-card').filter({hasText:'기본 하늘'}).click();
   await page.locator('.shop-detail .primary-button').click();
   await expect(page.locator('.garden-editor-preview')).toBeVisible();
   await expect(page.getByRole('button',{name:'미리보기 확인',exact:true})).toBeDisabled(); // unchanged layout
   await capture(page,info,role+'-owned-layout');
   expect(fingerprint(before)).toBe(fingerprint(await readAccount(auth,'/api/account/commerce')));
   writeAudit({outputPath:n=>info.outputPath(role+'-'+login+'-'+n)},audit,{mode:'LIVE_READ_ONLY_ENABLED_GATE',balance,price,login,noMutation:true,layoutRevision:before.garden.garden.layout_revision,purchases:before.purchases.length});
   expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);expect(audit.readErrors).toEqual([]);
  }finally{await context.close();}
  }
 }
});
