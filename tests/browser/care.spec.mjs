import { test, expect } from '@playwright/test';
import { fixture } from './fixtures.mjs';
import { installSession, guard, capture, ready, writeAudit, baseURL } from './support.mjs';

test('care completion: verified reward, Rive, duplicate click, reload and new session', async ({ browser }, info) => {
  const model=fixture('care');
  let posts=0, release;
  const route=async(url,method,request)=>{
    if(url.pathname==='/api/account/activity'&&method==='POST'){
      posts++;
      await new Promise(resolve=>{release=resolve;});
    }
    return model.route(url,method,request);
  };
  for(const visit of [1,2]){
    const context=await browser.newContext({...info.project.use,baseURL});
    const audit=await guard(context,route);
    await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
    await installSession(context,model.auth);
    try{
      const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.locator('.home-cta').click();
      await expect(page.locator('.care-card')).toHaveCount(3);
      if(visit===1){
        for(let i=0;i<2;i++){
          await page.locator('.care-card').nth(i).locator(':scope > button').click();
          const button=page.getByRole('button',{name:'시작하기',exact:true});
          await button.click(); // Starting the timer only changes local UI state.
          const pending=posts;
          await page.locator('[data-care-timer] .primary-button').dblclick();
          await expect.poll(()=>posts).toBe(pending+1);
          await expect(page.locator('[data-care-timer] .primary-button')).toBeDisabled();
          expect(model.day.cares.filter(c=>c.completed_at).length).toBe(i);
          expect(await page.locator('.completion-screen').count()).toBe(0);
          release();
          await expect(page.locator('.completion-screen')).toBeVisible();
          await expect(page.locator('.completion-screen .rive-plant--ready')).toBeVisible();
          expect(model.day.sunshineBalance).toBe(25);
          expect(model.day.rewards.filter(r=>r.reason==='firstCare').length).toBe(1);
          await capture(page,info,`care-completion-${i+1}`,false);
          // Inspect the rendered animation after its initial frames, not only the ready class.
          await page.waitForTimeout(2000);
          await capture(page,info,`care-completion-${i+1}-settled`,false);
          await page.locator('.completion-actions .primary-button').click();
          await expect(page.locator('.care-card-done')).toHaveCount(i+1);
        }
        await page.reload();await ready(page);await page.locator('.home-cta').click();
      }
      await expect(page.locator('.care-card-done')).toHaveCount(2);
      await expect(page.locator('.completion-screen')).toHaveCount(0);
      await expect(page.locator('.care-card').first().locator(':scope > button')).toHaveCount(0);
      await expect(page.locator('.care-card').first().getByRole('img',{name:'완료한 돌봄'})).toBeVisible();
      expect(posts).toBe(2);
      writeAudit({outputPath:name=>info.outputPath(`${visit}-${name}`)},audit,{mode:'REAL_CHROME_MOCKED_API',posts,balance:model.day.sunshineBalance,completed:2});
      expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
    }finally{await context.close();}
  }
});

test('care ambiguous response: one POST, read-only recovery, no replayed celebration', async ({ browser }, info) => {
  const model=fixture('care');let posts=0,readsAfterPost=0;
  const context=await browser.newContext({...info.project.use,baseURL});
  const audit=await guard(context,async(url,method,request)=>{
    if(url.pathname==='/api/account/activity'&&method==='POST'){
      posts++;await model.route(url,method,request);
      return {status:503,contentType:'application/json',body:JSON.stringify({error:'activity-uncertain-reload'})};
    }
    if(posts&&url.pathname==='/api/account/records'&&method==='GET')readsAfterPost++;
    return model.route(url,method,request);
  });
  await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
  await installSession(context,model.auth);
  try{
    const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.locator('.home-cta').click();
    await page.locator('.care-card').first().locator(':scope > button').click();
    await page.getByRole('button',{name:'시작하기',exact:true}).click();
    await page.locator('[data-care-timer] .primary-button').click();
    await expect(page.getByRole('button',{name:'서버 기록 확인',exact:true})).toBeVisible();
    await expect.poll(()=>readsAfterPost).toBeGreaterThan(0);
    await expect(page.locator('[data-care-timer] .primary-button')).toBeDisabled();
    expect(posts).toBe(1);
    await page.getByRole('button',{name:'서버 기록 확인',exact:true}).click();
    await expect(page.locator('.care-card-done')).toHaveCount(1);
    await expect(page.locator('.completion-screen')).toHaveCount(0);
    expect(posts).toBe(1);expect(model.day.sunshineBalance).toBe(25);
    expect(model.day.rewards.filter(r=>r.reason==='firstCare')).toHaveLength(1);
    writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_API',posts,readsAfterPost,recoveredWithoutCelebration:true});
    expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  }finally{await context.close();}
});
