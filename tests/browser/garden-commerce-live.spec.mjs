import {test,expect} from '@playwright/test';
import {account,readAccount,fingerprint,installSession,guard,ready,capture,writeAudit,baseURL} from './support.mjs';
test('live garden commerce: dated history, rewards, catalog, inventory and layout preview read-only',async({browser},info)=>{
 for(const role of ['A','B']){
  const auth=await account(role),before=await readAccount(auth,'/api/account/commerce');
  expect(typeof before.enabled).toBe('boolean');
  const month=await readAccount(auth,'/api/account/records?month='+before.garden.today.slice(0,7));
  const context=await browser.newContext({...info.project.use,baseURL}),audit=await guard(context);
  await installSession(context,auth);
  try{
   const page=await context.newPage();await page.goto(baseURL);await ready(page);
   await page.getByRole('navigation').getByRole('button',{name:'기록',exact:true}).click();
   for(const date of month.dates)await expect(page.locator(`.record-calendar button[aria-label^="${date}"] i`)).toHaveCount(1);
   const checked=[];
   for(const date of month.dates.slice(-2)){
    const day=await readAccount(auth,'/api/account/records?date='+date);
    await page.locator(`.record-calendar button[aria-label^="${date}"]`).click();
    await expect(page.locator('.record-details .answer-summary dd')).toHaveCount(4);
    const rewardCard=page.locator('.record-card').filter({has:page.getByRole('heading',{name:'이 날의 햇살',exact:true})});
    await expect(rewardCard.locator('li')).toHaveCount(day.rewards.length);
    await expect(rewardCard).toContainText(day.rewards.length?String(day.rewards.reduce((s,r)=>s+r.delta,0)):'이 날 받은 햇살이 없어요.');
    const careCard=page.locator('.record-card').filter({has:page.getByRole('heading',{name:'추천 행동',exact:true})});
    if(day.cares.length)await expect(careCard.locator('li')).toHaveCount(3);
    const meta=await readAccount(auth,'/api/account/photos?date='+date);
    if(meta.hasPhoto){await expect(page.locator('.record-photo')).toBeVisible();await expect.poll(()=>page.locator('.record-photo').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);}
    for(const text of [day.record?.note,day.record?.photo_comment].filter(Boolean)){
      const matches=await page.locator('.record-details .saved-text').evaluateAll((nodes,value)=>nodes.some(n=>n.textContent===value),text);expect(matches).toBe(true);
    }
    expect(fingerprint(day)).toBe(fingerprint(await readAccount(auth,'/api/account/records?date='+date)));
    checked.push(date);
   }
   await capture(page,info,role+'-calendar');
   await page.getByRole('navigation').getByRole('button',{name:'정원',exact:true}).click();
   await page.getByRole('button',{name:'상점',exact:true}).click();
   await expect(page.locator('.shop-summary strong')).toContainText(String(before.garden.garden.sunshine_balance));
   await page.locator('.shop-card').filter({hasText:'모모'}).click();
   await expect(page.locator('.shop-price')).toContainText(String(before.catalog.find(i=>i.id==='momo').price));
   await expect(page.locator('.shop-detail .primary-button')).toBeDisabled();
   await capture(page,info,role+'-shop');
   await page.getByRole('button',{name:'보관함 열기',exact:true}).click();
   await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'배경',exact:true}).click();
   await expect(page.locator('.shop-card')).toHaveCount(before.garden.inventory.filter(i=>i.item_id.includes('sky')||i.item_id.includes('garden')).length);
   await page.locator('.shop-card').filter({hasText:'기본 하늘'}).click();
   await page.getByRole('button',{name:'위치 변경 · 배치 해제',exact:true}).click();
   await expect(page.locator('.garden-editor-preview')).toBeVisible();
   await capture(page,info,role+'-layout-preview');
   expect(fingerprint(before)).toBe(fingerprint(await readAccount(auth,'/api/account/commerce')));
   writeAudit({outputPath:n=>info.outputPath(role+'-'+n)},audit,{mode:'LIVE_READ_ONLY',dates:checked,balance:before.garden.garden.sunshine_balance,inventory:before.garden.inventory.length,writesEnabled:before.enabled});
   expect(audit.blockedWrites).toEqual([]);expect(audit.readErrors).toEqual([]);expect(audit.pageErrors).toBe(0);
  }finally{await context.close();}
 }
});
