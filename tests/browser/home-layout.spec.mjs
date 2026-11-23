import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './fixtures.mjs';
import { guard, installSession, capture, ready, baseURL, writeAudit } from './support.mjs';

test('home layout: first entry and short viewport keep the existing action clear of navigation',async({browser},info)=>{
 const model=fixture('photo',true);
 const context=await browser.newContext({...info.project.use,baseURL});
 const audit=await guard(context,model.route);
 await context.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
 await installSession(context,model.auth);
 const page=await context.newPage();
 const sizes=[info.project.use.viewport,...(info.project.name==='mobile'?[{width:320,height:568},{width:320,height:480}]:[])];
 try{
   const measurements=[];
   for(const size of sizes){
     await page.setViewportSize(size);await page.goto(baseURL);await ready(page);
     const name=`home-${size.width}x${size.height}`;
     await capture(page,info,name+'-initial',false);
     const measure=()=>page.evaluate(()=>{
       const button=document.querySelector('.home-cta'),nav=document.querySelector('.bottom-nav'),frame=document.querySelector('.phone-frame');
       const b=button.getBoundingClientRect(),n=nav.getBoundingClientRect(),f=frame.getBoundingClientRect();
       const points=[[b.left+8,b.top+8],[b.right-8,b.top+8],[b.left+8,b.bottom-8],[b.right-8,b.bottom-8],[b.left+b.width/2,b.top+b.height/2]];
       return {button:{top:b.top,bottom:b.bottom,height:b.height},navigation:{top:n.top,height:n.height,position:getComputedStyle(nav).position,bottomMargin:parseFloat(getComputedStyle(nav).marginBottom)},gap:n.top-b.bottom,
         insideFrame:b.top>=f.top&&b.bottom<=f.bottom,allPointsClickable:points.every(([x,y])=>button.contains(document.elementFromPoint(x,y))),
         background:getComputedStyle(button).backgroundColor,fontSize:getComputedStyle(button).fontSize};
     });
     const initial=await measure();measurements.push({size,initial});fs.writeFileSync(info.outputPath('home-metrics.json'),JSON.stringify(measurements,null,2));
     expect(initial.gap,'first-entry gap above navigation').toBeGreaterThanOrEqual(8);expect(initial.insideFrame).toBe(true);expect(initial.allPointsClickable).toBe(true);expect(initial.button.height).toBe(56);
     await page.locator('.home-scroll-content, .home-screen:not(:has(.home-scroll-content))').evaluate(el=>{el.scrollTop=el.scrollHeight;});
     await capture(page,info,name+'-scrolled',false);
     const scrolled=await measure();expect(scrolled.gap).toBeGreaterThanOrEqual(8);expect(scrolled.allPointsClickable).toBe(true);
     // Return to the first viewport position before testing the actual pointer click.
     await page.locator('.home-scroll-content, .home-screen:not(:has(.home-scroll-content))').evaluate(el=>{el.scrollTop=0;});
     await page.locator('.home-cta').click({position:{x:16,y:48}});
     await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
     await expect(page.locator('#photo-comment')).toBeVisible();
     expect(await page.locator('#photo-comment').evaluate(el=>el.getBoundingClientRect().height)).toBe(86);
     expect(await page.getByRole('button',{name:'코멘트 저장',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeCloseTo(48,1);
   }
   writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_READS'});expect(audit.fixtureWrites).toEqual([]);expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{await context.close();}
});
