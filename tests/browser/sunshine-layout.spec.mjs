import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './fixtures.mjs';
import { installSession, guard, ready, baseURL } from './support.mjs';

const before = process.env.ONESTEP_SUNSHINE_BEFORE === '1';
for (const [width, height] of [[320,480],[320,568],[390,844],[1280,900]]) {
  test(`sunshine containment ${width}x${height}`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix; do not duplicate it.');
    const m = fixture('growth');
    const context = await browser.newContext({ baseURL, viewport: { width, height }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
    const audit = await guard(context, m.route);
    await context.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(m.user) }));
    await installSession(context,m.auth);
    try {
      const page = await context.newPage();await page.goto(baseURL);await ready(page);
      await page.locator('.home-cta').click();
      await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
      await page.getByRole('button',{name:'오늘의 추천 행동 만나보기',exact:true}).click();
      await expect(page.locator('.sunshine-feedback')).toBeAttached();
      await expect(page.locator('.sunshine-feedback strong')).toHaveText('햇살 +5');
      const results=[];
      async function measure(label, time) {
        const metrics=await page.locator('.sunshine-feedback').evaluate((el,time)=>{
          for(const a of el.getAnimations()){a.pause();a.currentTime=time;}
          const b=el.getBoundingClientRect();
          const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
          const boxes=[...el.children].flatMap(child=>{
            const range=document.createRange();range.selectNodeContents(child);
            return [child.getBoundingClientRect(),...range.getClientRects()].map(rect);
          });
          return {box:rect(b),boxes,contained:boxes.every(r=>r.left>=b.left-.5&&r.right<=b.right+.5&&r.top>=b.top-.5&&r.bottom<=b.bottom+.5),animation: getComputedStyle(el).animationName};
        },time);
        results.push({label,...metrics});
        await page.screenshot({path:info.outputPath(`${before?'before':'after'}-${label}.png`)});
        if(!before)expect(metrics.contained,label).toBe(true);
        expect(metrics.animation).toBe('sunshine-banner');
      }
      for(const [label,time] of [['entrance',400],['hold',1300],['before-exit',2500],['exit',2750]])await measure(label,time);
      if(!before){
        await page.locator('.sunshine-feedback > span:last-child').evaluate(el=>{el.textContent='오늘도 나를 돌봐 주었어요. 아주 긴 안내 문구도 배경 안에서 자연스럽게 줄바꿈되어야 해요.';});
        await measure('long-copy',1300);
      }
      await page.clock.runFor(3100);
      await expect(page.locator('.sunshine-feedback')).toHaveCount(0);
      for(let i=0;i<2;i++){
        await page.locator('.care-card').nth(i).locator(':scope > button').click();
        await page.getByRole('button',{name:'해볼게요',exact:true}).click();
        await page.locator('[data-care-timer] .primary-button').click();
        await expect(page.locator('.completion-screen')).toBeVisible();
        if(i===0){await expect(page.locator('.sunshine-feedback strong')).toHaveText('햇살 +10');await measure('first-care',1300);}
        else await expect(page.locator('.sunshine-feedback')).toHaveCount(0);
        await page.clock.runFor(3100);
        await page.locator('.completion-actions .primary-button').click();
      }
      expect(m.day.sunshineBalance).toBe(25);
      expect(audit.blockedWrites).toEqual([]);
      fs.writeFileSync(info.outputPath('measurements.json'),JSON.stringify({mode:'REAL_CHROME_MOCKED_API',results,fixtureWrites:audit.fixtureWrites},null,2));
    } finally {await context.close();}
  });
}
