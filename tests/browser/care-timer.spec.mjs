import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {guard,installSession,ready,baseURL} from './support.mjs';
import {loadTs} from '../../scripts/helpers/load-ts.mjs';
const {ACTIVE_CARES}=loadTs(new URL('../../src/app/cares.ts',import.meta.url));

for(const [width,height] of [[1280,900],[390,844],[320,568],[320,480]])test(`optional care timer ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewport matrix');
 const a=fixture('care'),b=fixture('care',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');let model=a,posts=0,release;
 const context=await browser.newContext({baseURL,viewport:{width,height},serviceWorkers:'block'});
 const audit=await guard(context,async(u,method,request)=>{
  if(u.pathname==='/api/account/activity'&&method==='POST'){posts++;await new Promise(r=>{release=r;});}
  return model.route(u,method,request);
 });
 await context.route('**/auth/v1/**',r=>{const p=new URL(r.request().url()).pathname;if(p.endsWith('/logout'))return r.fulfill({status:204});if(p.endsWith('/token'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b.auth.session)});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)});});
 await installSession(context,a.auth);
 try{
  const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.locator('.home-cta').click();
  await page.screenshot({path:info.outputPath('timer-collapsed.png'),animations:'disabled'});
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
  async function start(index){
    const card=page.locator('.care-card').nth(index);
    await card.locator(':scope > button').click();
    await expect(page.locator('.care-card')).toHaveCount(3);
    await expect(page.locator('.care-detail-screen')).toHaveCount(0);
    await expect(card.locator('[data-care-expansion]')).toHaveAttribute('data-open','true');
    await expect(card.locator(':scope > button')).toHaveCount(0);
    await page.screenshot({path:info.outputPath(`inline-description-${index}.png`),animations:'disabled'});
    await card.getByRole('button',{name:'접기',exact:true}).click();
    await expect(card.locator('[data-care-expansion]')).toHaveAttribute('data-open','false');
    await card.locator(':scope > button').click();
    await card.getByRole('button',{name:'시작하기',exact:true}).click();
    await expect(page.locator('[data-care-timer]')).toBeVisible();
    await expect(card.locator(':scope > button')).toHaveCount(0);
  }
  await start(0);
  const timer=page.getByRole('timer'),duration=ACTIVE_CARES.find(c=>c.id===a.day.cares[0].care_id).minutes*60;
  const format=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  await expect(timer).toHaveText(format(duration));await page.clock.runFor(1200);await expect(timer).toHaveText(format(duration-1));
  await page.getByRole('button',{name:'일시정지',exact:true}).click();const paused=await timer.textContent();await page.clock.runFor(4000);await expect(timer).toHaveText(paused);
  const first=page.locator('.care-card').first();
  await first.getByRole('button',{name:'접기',exact:true}).click();await page.clock.runFor(4000);await first.locator(':scope > button').click();await expect(timer).toHaveText(paused);await expect(first.getByRole('button',{name:'이어하기',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'이어하기',exact:true}).click();await page.clock.runFor(1000);expect(await timer.textContent()).not.toBe(paused);
  const running=await timer.textContent();await first.getByRole('button',{name:'접기',exact:true}).click();await page.clock.runFor(1100);await first.locator(':scope > button').click();expect(await timer.textContent()).not.toBe(running);
  const geometry=await page.locator('.care-list').evaluate(el=>{
   const cards=[...el.querySelectorAll('.care-card')].map(c=>c.getBoundingClientRect());const p=el.querySelector('[data-care-timer]').getBoundingClientRect(),owner=el.querySelector('[data-care-timer]').parentElement.getBoundingClientRect();
   return {noOverlap:cards.every((r,i)=>i===0||r.top>=cards[i-1].bottom),inside:p.left>=owner.left&&p.right<=owner.right&&p.bottom<=owner.bottom,viewport:cards.every(r=>r.left>=0&&r.right<=innerWidth)};
  });expect(geometry).toEqual({noOverlap:true,inside:true,viewport:true});
  await page.locator('[data-care-timer]').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('timer-expanded.png'),animations:'disabled'});
  await page.locator('.care-plant').scrollIntoViewIfNeeded();await expect(page.locator('.care-plant')).toBeInViewport();
  await page.screenshot({path:info.outputPath('timer-plant.png'),animations:'disabled'});
  await page.clock.fastForward(duration*1000+1000);await expect(timer).toHaveText('00:00');await expect(page.locator('[data-care-timer] [role=status]')).toContainText('작은 쉼의 시간이 지났어요.');
  expect(posts).toBe(0);expect(a.day.sunshineBalance).toBe(15);expect(a.day.cares.every(c=>!c.completed_at)).toBe(true);
  await page.getByRole('button',{name:'돌봄 마쳤어요',exact:true}).dblclick();await expect.poll(()=>posts).toBe(1);await expect(page.locator('.completion-screen')).toHaveCount(0);release();
  await expect(page.locator('.completion-screen')).toBeVisible();expect(a.day.sunshineBalance).toBe(25);
  await page.locator('.completion-actions .primary-button').click();await start(1);
  await expect(timer).toHaveText(format(ACTIVE_CARES.find(c=>c.id===a.day.cares[1].care_id).minutes*60));
  await expect(timer).not.toHaveText('00:00');await page.getByRole('button',{name:'타이머 없이 하기',exact:true}).click();await expect(timer).toHaveCount(0);
  await page.getByRole('button',{name:'돌봄 마쳤어요',exact:true}).click();await expect.poll(()=>posts).toBe(2);release();await expect(page.locator('.completion-screen')).toBeVisible();expect(a.day.sunshineBalance).toBe(25);
  await page.reload();await ready(page);await page.locator('.home-cta').click();await expect(page.locator('.care-card-done')).toHaveCount(2);await expect(page.locator('[data-care-timer]')).toHaveCount(0);await expect(page.locator('.completion-screen')).toHaveCount(0);
  await start(2);await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await ready(page);await page.clock.fastForward(600000);expect(posts).toBe(2);
  await page.locator('.home-cta').click();await expect(page.locator('[data-care-timer]')).toHaveCount(0);await start(2);await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await ready(page);
  await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();model=b;
  await page.locator('input[name=email]').fill('timer-fixture@example.invalid');await page.locator('input[name=password]').fill('fixture-only');await page.getByRole('button',{name:'로그인',exact:true}).click();await ready(page);await page.locator('.home-cta').click();await expect(page.locator('[data-care-timer]')).toHaveCount(0);await expect(page.locator('.care-card-done')).toHaveCount(0);
  expect(posts).toBe(2);expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{release?.();await context.close();}
});
