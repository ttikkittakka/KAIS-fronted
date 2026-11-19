import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './fixtures.mjs';
import { installSession, guard, capture, ready, writeAudit, baseURL } from './support.mjs';

test('care list layout: full plant and cards remain reachable on short screens', async ({browser},info)=>{
  test.skip(info.project.name!=='mobile');
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:320,height:480}]){
    const model=fixture('care'),context=await browser.newContext({...info.project.use,viewport,baseURL});
    const audit=await guard(context,model.route);
    await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
    await installSession(context,model.auth);
    try{
      const page=await context.newPage();await page.goto(baseURL);await ready(page);await page.locator('.home-cta').click();
      if(process.env.ONESTEP_LAYOUT_BASELINE==='1'){
        // Reproduce the measured original declarations in this isolated browser only.
        await page.addStyleTag({content:`
          .phone-frame > .care-screen:has(> .care-list){display:block;padding-bottom:30px;scroll-padding-block:0}
          .care-screen:has(> .care-list) > .care-intro{padding-top:28px;padding-bottom:22px}
          .care-screen > .care-list{gap:11px}
          .care-screen:has(> .care-list) > .rest-choice{margin-top:20px;margin-bottom:0}
          .care-screen:has(> .care-list) > .care-plant{margin:12px auto 0}
        `});
      }
      await expect(page.locator('.care-card')).toHaveCount(3);
      await expect(page.locator('.care-plant .rive-plant--ready')).toBeAttached();
      await page.waitForTimeout(4500); // Existing Rive initial frames settle before visual comparison.
      const name=`care-${viewport.width}x${viewport.height}`;
      await capture(page,info,name+'-initial',false);
      const metrics=await page.evaluate(()=>{
        const screen=document.querySelector('.care-screen'),plant=document.querySelector('.care-plant'),canvas=plant.querySelector('canvas');
        const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        return {screen:rect(screen),scrollHeight:screen.scrollHeight,plant:rect(plant),canvas:rect(canvas),
          cards:[...document.querySelectorAll('.care-card')].map(rect),buttons:[...document.querySelectorAll('.care-card > button')].map(rect),
          introPadding:getComputedStyle(document.querySelector('.care-intro')).padding,
          plantOverflow:getComputedStyle(plant).overflow,canvasTransform:getComputedStyle(canvas).transform};
      });
      await page.locator('.care-screen').evaluate(el=>el.scrollTop=el.scrollHeight);
      await page.waitForTimeout(3500); // Offscreen canvases start rendering only after scrolling into view.
      await capture(page,info,name+'-bottom',false);
      const bottom=await page.evaluate(()=>{
        const screen=document.querySelector('.care-screen').getBoundingClientRect(),plant=document.querySelector('.care-plant').getBoundingClientRect(),canvas=document.querySelector('.care-plant canvas').getBoundingClientRect(),nav=document.querySelector('.bottom-nav')?.getBoundingClientRect();
        return {plantFullyVisible:plant.top>=screen.top&&plant.bottom<=Math.min(screen.bottom,nav?.top??innerHeight)+1,canvasContained:canvas.top>=plant.top-1&&canvas.bottom<=plant.bottom+1,scrollTop:document.querySelector('.care-screen').scrollTop};
      });
      fs.writeFileSync(info.outputPath(name+'-metrics.json'),JSON.stringify({...metrics,bottom},null,2));
      for(const button of await page.locator('.care-card > button').all()){
        await button.scrollIntoViewIfNeeded();await button.click({trial:true});
      }
      expect(metrics.buttons.every(b=>b.height>=44)).toBe(true);
      if(process.env.ONESTEP_LAYOUT_BASELINE!=='1'){
        expect(bottom.plantFullyVisible).toBe(true);expect(bottom.canvasContained).toBe(true);
        // Readable multi-row cards may scroll at every viewport; the full plant
        // must remain reachable rather than compressing text to fit one screen.
        expect(metrics.cards.every((card,i)=>i===0||card.top>=metrics.cards[i-1].bottom)).toBe(true);
      }
      writeAudit({outputPath:n=>info.outputPath(name+'-'+n)},audit,{mode:'REAL_CHROME_MOCKED_READS'});
      expect(audit.fixtureWrites).toEqual([]);expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
    }finally{await context.close();}
  }
});
