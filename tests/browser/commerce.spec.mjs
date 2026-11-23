import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {installSession,guard,ready,capture,writeAudit,baseURL} from './support.mjs';
test('commerce mock: purchase once, inventory, verified layout and reload',async({browser},info)=>{
 const m=fixture('care');m.state.commerceEnabled=true;m.day.sunshineBalance=70;m.state.commerceDelay=500;
 const context=await browser.newContext({...info.project.use,baseURL}),audit=await guard(context,m.route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
  const page=await context.newPage();await page.goto(baseURL);await ready(page);
  await page.getByRole('button',{name:'상점',exact:true}).click();
  await expect(page.locator('.shop-summary strong')).toContainText('70');
  await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'꾸미기',exact:true}).click();
  await page.locator('.shop-card').filter({hasText:'노란 꽃'}).click();
  await page.locator('.shop-detail .primary-button').dblclick();
  await expect(page.locator('#purchase-title')).toBeVisible();
  expect(m.commerce().purchases).toHaveLength(1);expect(m.day.sunshineBalance).toBe(40);
  await capture(page,info,'mock-purchase-verified',false);
  await page.getByRole('button',{name:'정원에 배치하기',exact:true}).click();
  await page.locator('.garden-slot-choices button').first().click();
  await page.getByRole('button',{name:'미리보기 확인',exact:true}).click();
  await page.getByRole('button',{name:'배치 저장',exact:true}).dblclick();
  await expect(page.locator('.garden-editor-actions [role=status]')).toHaveText('배치 저장 완료');
  expect(m.garden.garden.layout_revision).toBe(1);expect(m.day.sunshineBalance).toBe(40);
  await capture(page,info,'mock-layout-verified',false);
  await page.reload();await ready(page);await page.getByRole('button',{name:'상점',exact:true}).click();
  await page.getByRole('button',{name:'보관함 열기',exact:true}).click();
  await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'꾸미기',exact:true}).click();
  await expect(page.locator('.shop-card')).toHaveCount(1);await expect(page.locator('.shop-card')).toContainText('배치 중');
  expect(audit.fixtureWrites.filter(p=>p==='/api/account/commerce')).toHaveLength(2);
  expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_API',balance:40,layoutRevision:1});
 }finally{await context.close();}
});

test('commerce mock: lost purchase response reads first; failed layout preserves draft',async({browser},info)=>{
 const m=fixture('care');m.state.commerceEnabled=true;m.day.sunshineBalance=70;m.state.commerceLost=true;
 const context=await browser.newContext({...info.project.use,baseURL}),audit=await guard(context,m.route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
  const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.getByRole('button',{name:'상점',exact:true}).click();
  await page.getByRole('group',{name:'상품 카테고리'}).getByRole('button',{name:'꾸미기',exact:true}).click();
  await page.locator('.shop-card').filter({hasText:'노란 꽃'}).click();await page.locator('.shop-detail .primary-button').click();
  await expect(page.locator('.shop-error')).toBeVisible();await expect(page.locator('#purchase-title')).toHaveCount(0);
  await page.locator('.shop-detail .primary-button').click();
  expect(audit.fixtureWrites.filter(p=>p==='/api/account/commerce')).toHaveLength(1);
  await page.getByRole('button',{name:'다시 확인하기',exact:true}).click();
  await expect(page.locator('.shop-owned')).toBeVisible();expect(m.commerce().purchases).toHaveLength(1);expect(m.day.sunshineBalance).toBe(40);
  await page.getByRole('button',{name:'정원에 배치하기',exact:true}).click();
  await page.locator('.garden-slot-choices button').first().click();await page.getByRole('button',{name:'미리보기 확인',exact:true}).click();
  m.state.commerceLost=false;m.state.commerceFailure=true;
  await page.getByRole('button',{name:'배치 저장',exact:true}).click();
  await expect(page.locator('.garden-editor .shop-error')).toBeVisible();
  await expect(page.locator('.garden-change-list li')).toHaveCount(1);
  await expect(page.locator('.garden-editor-actions [role=status]')).toHaveCount(0);
  expect(m.garden.garden.layout_revision).toBe(0);expect(m.day.sunshineBalance).toBe(40);
  await capture(page,info,'mock-failed-layout-draft-preserved',false);
  expect(audit.fixtureWrites.filter(p=>p==='/api/account/commerce')).toHaveLength(2);
  expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_API',lostResponseRecovered:true,layoutDraftPreserved:true});
 }finally{await context.close();}
});
