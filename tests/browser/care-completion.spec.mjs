import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {guard,installSession,ready,baseURL} from './support.mjs';

for(const [width,height] of [[1280,900],[390,844],[320,568],[320,480]])test(`warm completion ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewport matrix');
 const m=fixture('care');
 const context=await browser.newContext({baseURL,viewport:{width,height},serviceWorkers:'block'}),audit=await guard(context,m.route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
  const p=await context.newPage();await p.goto(baseURL);await ready(p);await p.locator('.home-cta').click();
  for(const index of [0,1,2]){
   await p.locator('.care-card').nth(index).locator(':scope > button').click();await p.getByRole('button',{name:'해볼게요',exact:true}).click();await p.getByRole('button',{name:'돌봄 마쳤어요',exact:true}).click();
   await expect(p.locator('.completion-screen')).toBeVisible();await expect(p.locator('.completion-scene .rive-plant--ready')).toBeVisible();
   await expect(p.locator('.completion-status')).toHaveText(`오늘 ${index+1}/3 완료`);await expect(p.locator('.completion-dots .is-complete')).toHaveCount(index+1);
   await p.waitForTimeout(5000);
   const fit=await p.locator('.completion-screen').evaluate(el=>{
    const box=el.getBoundingClientRect(),plant=el.querySelector('.plant-art').getBoundingClientRect(),copy=el.querySelector('.completion-copy').getBoundingClientRect(),actions=el.querySelector('.completion-actions').getBoundingClientRect();
    const scene=el.querySelector('.completion-scene').getBoundingClientRect();
    return {center:Math.abs((plant.left+plant.right-box.left-box.right)/2)<1,ordered:scene.top>=copy.bottom&&actions.top>=scene.bottom-1,overflow:el.scrollWidth>el.clientWidth,sceneWidth:plant.width,actionGap:actions.top-scene.bottom};
   });expect(fit.center).toBe(true);expect(fit.ordered).toBe(true);expect(fit.overflow).toBe(false);expect(fit.sceneWidth).toBeGreaterThanOrEqual(250);expect(fit.actionGap).toBeGreaterThanOrEqual(0);
   await p.locator('.completion-screen').evaluate(el=>{el.scrollTop=0;});await p.screenshot({path:info.outputPath(`complete-${index+1}-top.png`)});
   await p.locator('.completion-actions .secondary-button').scrollIntoViewIfNeeded();await expect(p.locator('.completion-actions .secondary-button')).toBeInViewport();await p.screenshot({path:info.outputPath(`complete-${index+1}-actions.png`)});
   expect(m.day.sunshineBalance).toBe(25);
   if(index<2)await p.getByRole('button',{name:'다른 돌봄 해보기',exact:true}).click();
  }
  await expect(p.locator('.completion-actions .primary-button')).toHaveText('정원에서 변화 보기');
  await p.emulateMedia({reducedMotion:'reduce'});expect(await p.locator('.completion-copy').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await p.reload();await ready(p);await p.locator('.home-cta').click();await expect(p.locator('.completion-screen')).toHaveCount(0);await expect(p.locator('.care-card-done')).toHaveCount(3);
  expect(audit.blockedWrites).toEqual([]);expect(audit.fixtureWrites).toHaveLength(3);expect(audit.pageErrors).toBe(0);
 }finally{await context.close();}
});
