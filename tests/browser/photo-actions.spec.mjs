import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {guard,installSession,ready,baseURL,samplePhoto} from './support.mjs';
const before=process.env.ONESTEP_PHOTO_BEFORE==='1';
for(const [width,height] of [[1280,900],[390,844],[320,568]])test(`photo actions ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewports');
 const m=fixture('photo');m.day.record.answers[3]=width===390?'very_good':'low';m.day.record.note='preserved fixture note';let posts=0,activities=0;
 const route=async(u,method,request)=>{
  if(u.pathname==='/api/account/activity'&&method==='POST')activities++;
  if(u.pathname==='/api/account/photos'&&method==='POST'){
   posts++;await new Promise(r=>setTimeout(r,400));
   if(!before&&posts===1)return {status:503,body:JSON.stringify({error:'fixture-failure'}),contentType:'application/json'};
   const result=await m.route(u,method,request);
   if(!before&&posts===2)return {status:503,body:JSON.stringify({error:'fixture-response-lost'}),contentType:'application/json'};
   return result;
  }
  return m.route(u,method,request);
 };
 const context=await browser.newContext({baseURL,viewport:{width,height},serviceWorkers:'block'});
 const audit=await guard(context,route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
  const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.locator('.home-cta').click();
  const back=page.getByRole('button',{name:'뒤로 가기',exact:true});const box=await back.boundingBox();expect(box.width).toBeGreaterThanOrEqual(43.99);expect(box.height).toBeGreaterThanOrEqual(43.99);
  if(!before){const icon=await back.locator('svg').boundingBox();expect(icon.width).toBeCloseTo(20,2);}
  await expect(page.locator('.question-mark svg')).toBeVisible();
  const geometry=await page.locator('.question-mark').evaluate(el=>{const b=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return {width:s.width,height:s.height,dx:(s.left+s.width/2)-(b.left+b.width/2),dy:(s.top+s.height/2)-(b.top+b.height/2)};});
  expect(geometry.width).toBeCloseTo(22,2);expect(geometry.height).toBeCloseTo(22,2);expect(Math.abs(geometry.dx)).toBeLessThan(.5);expect(Math.abs(geometry.dy)).toBeLessThan(.5);
  const mood=page.locator('.mood-chip');await expect(mood).toContainText('오늘의 마음 · '+(width===390?'가벼워요':'조금 무거워요'));
  expect(await mood.evaluate(el=>({tag:el.tagName,tab:el.tabIndex,role:el.getAttribute('role')}))).toEqual({tag:'P',tab:-1,role:null});
  await mood.click();expect(posts).toBe(0);expect(activities).toBe(0);await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
  const contained=await mood.evaluate(el=>{const text=el.lastElementChild,original=text.textContent;text.textContent='오늘의 마음 · 아주 길게 설명하는 마음도 화면 밖으로 넘치지 않도록 확인하는 문구';const b=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(text);const fits=[...range.getClientRects()].every(r=>r.left>=b.left-.5&&r.right<=b.right+.5&&r.top>=b.top-.5&&r.bottom<=b.bottom+.5)&&b.right<=innerWidth;text.textContent=original;return fits;});expect(contained).toBe(true);
  await page.screenshot({animations:'disabled',path:info.outputPath(`${before?'before':'after'}-photo.png`)});
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'사진 선택',exact:true}).click();await(await chooser).setFiles(samplePhoto);
  await expect(page.locator('.photo-editor .record-photo')).toBeVisible();await page.locator('#photo-comment').fill('fixture comment');
  const save=page.getByRole('button',{name:'이 사진 저장하기',exact:true});await save.click();
  if(!before)await expect(page.locator('.photo-editor [role=status]').filter({hasText:'사진과 코멘트를 저장하고 있어요.'})).toBeVisible();
  await page.screenshot({animations:'disabled',path:info.outputPath(`${before?'before':'after'}-saving.png`)});
  if(before){await expect(page.locator('main')).toHaveAttribute('data-account-view','growth');return;}
  for(let attempt=1;attempt<=2;attempt++){
   await expect(page.locator('.photo-editor [role=alert]')).toBeVisible();await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
   await expect(page.getByRole('button',{name:'성장하기로 이어가기',exact:true})).toBeDisabled();expect(activities).toBe(0);
   await save.click();
  }
  await expect(page.locator('.photo-editor')).toContainText('사진을 내 기록에 저장했어요.');expect(posts).toBe(2);expect(activities).toBe(0);
  expect(m.day.record.note).toBe('preserved fixture note');expect(m.day.record.photo_comment).toBe('fixture comment');
  await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
  await page.screenshot({animations:'disabled',path:info.outputPath('after-saved.png')});
  await page.reload();await ready(page);await page.locator('.home-cta').click();
  await expect(page.locator('.photo-editor .record-photo')).toBeVisible();await expect(page.locator('#photo-comment')).toHaveValue('fixture comment');
  await page.getByRole('button',{name:'성장하기로 이어가기',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-account-view','growth');expect(activities).toBe(1);expect(posts).toBe(2);
  expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  const restored=await browser.newContext({baseURL,viewport:{width,height},serviceWorkers:'block'});
  await guard(restored,m.route);await restored.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(restored,m.auth);
  try{const p=await restored.newPage();await p.goto(baseURL);await ready(p);await p.getByRole('navigation').getByRole('button',{name:'기록',exact:true}).click();await expect(p.locator('.record-details .record-photo')).toBeVisible();await expect(p.locator('.record-details')).toContainText('fixture comment');expect(posts).toBe(2);}finally{await restored.close();}
 }finally{await context.close();}
});

test('photo without selection advances only after verified activity',async({browser},info)=>{
 const m=fixture('photo');let release;
 const context=await browser.newContext({...info.project.use,baseURL});
 const audit=await guard(context,async(u,method,request)=>{if(u.pathname==='/api/account/activity'&&method==='POST')await new Promise(r=>{release=r;});return m.route(u,method,request);});
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{const p=await context.newPage();await p.goto(baseURL);await ready(p);await p.locator('.home-cta').click();await p.getByRole('button',{name:'성장하기로 이어가기',exact:true}).click();await expect.poll(()=>typeof release).toBe('function');await expect(p.locator('main')).toHaveAttribute('data-account-view','photo');release();await expect(p.locator('main')).toHaveAttribute('data-account-view','growth');expect(m.state.hasPhoto).toBe(false);expect(audit.fixtureWrites).toEqual(['/api/account/activity']);}finally{release?.();await context.close();}
});

