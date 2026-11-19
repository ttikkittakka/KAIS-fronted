import { test, expect } from '@playwright/test';
import { account, readAccount, fingerprint, installSession, guard, capture, ready, writeAudit, baseURL } from './support.mjs';

test('live care read-only: completed missions restore without reward or animation replay', async ({browser},info)=>{
  const originalAuth=await account('A');
  const before=await readAccount(originalAuth);
  test.skip(before.record?.stage!=='care','Today has not reached care; no activity is submitted.');
  const other=await account('B'),otherBefore=await readAccount(other);
  const completed=before.cares.filter(c=>c.completed_at).length;
  for(const login of [1,2]){
    const auth=login===1?originalAuth:await account('A',true);
    const context=await browser.newContext({...info.project.use,baseURL});
    const audit=await guard(context); // This automated test is strictly read-only, never the user's test window.
    try{
      await installSession(context,auth);
      const page=await context.newPage();
      const inspect=async()=>{
        await ready(page);await page.locator('.home-cta').click();
        await expect(page.locator('.care-card')).toHaveCount(3);
        await expect(page.locator('.care-card-done')).toHaveCount(completed);
        await expect(page.locator('.completion-screen')).toHaveCount(0);
        if(completed){
          await expect(page.locator('.care-card-done button')).toHaveCount(0);
          await expect(page.locator('.care-card-done [aria-label="완료한 돌봄"]')).toHaveCount(completed);
        }
        const unfinished=page.locator('.care-card:not(.care-card-done) > button').first();
        if(completed<3){
          await unfinished.click();
          // Only inspect the button; never start or complete a real mission automatically.
          await expect(page.getByRole('button',{name:'해볼게요',exact:true})).toBeEnabled();
        }
      };
      await page.goto(baseURL);await inspect();
      await page.reload();await inspect();
      await capture(page,info,`live-care-login-${login}`);
      const unchanged=fingerprint(before)===fingerprint(await readAccount(auth));
      const otherUnchanged=fingerprint(otherBefore)===fingerprint(await readAccount(other));
      writeAudit({outputPath:n=>info.outputPath(`${login}-${n}`)},audit,{mode:'LIVE_READ_ONLY',date:before.date,revision:before.record.revision,completed,balance:before.sunshineBalance,snapshotUnchanged:unchanged,bUnchanged:otherUnchanged});
      expect(unchanged).toBe(true);expect(otherUnchanged).toBe(true);
      expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);expect(audit.readErrors).toEqual([]);
    }finally{await context.close();}
  }
});
