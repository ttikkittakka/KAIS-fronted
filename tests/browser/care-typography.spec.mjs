import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {guard,installSession,ready,baseURL} from './support.mjs';
import {loadTs} from '../../scripts/helpers/load-ts.mjs';
const {ACTIVE_CARES}=loadTs(new URL('../../src/app/cares.ts',import.meta.url));
for(const [width,height] of [[1280,900],[390,844],[320,568],[320,480]])test(`catalog typography ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewport matrix');
 const m=fixture('care'),context=await browser.newContext({baseURL,viewport:{width,height},serviceWorkers:'block'}),audit=await guard(context,m.route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
  const p=await context.newPage();
  for(let offset=0;offset<ACTIVE_CARES.length;offset+=3){
   const batch=ACTIVE_CARES.slice(offset,offset+3);m.day.cares.forEach((c,i)=>{c.care_id=(batch[i]??ACTIVE_CARES[i]).id;});
   await p.goto(baseURL);await ready(p);await p.locator('.home-cta').click();
   const checks=await p.locator('.care-card').evaluateAll(cards=>cards.map(card=>{
    const b=card.getBoundingClientRect(),title=card.querySelector('h3'),style=getComputedStyle(title);
    const texts=[title,card.querySelector('.care-summary'),card.querySelector('.care-meta')];
    let words=true,inside=true;
    for(const el of texts){const node=el.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)continue;for(const match of node.textContent.matchAll(/\S+/g)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const rects=[...range.getClientRects()];if(rects.length>1)words=false;if(rects.some(r=>r.left<b.left||r.right>b.right))inside=false;}}
    return {words,inside,twoLines:title.getBoundingClientRect().height<=parseFloat(style.lineHeight)*2+.5,width:card.scrollWidth<=card.clientWidth};
   }));checks.forEach(c=>expect(c).toEqual({words:true,inside:true,twoLines:true,width:true}));
   if(offset===0||offset===Math.floor(ACTIVE_CARES.reduce((best,c,i)=>c.title.length>ACTIVE_CARES[best].title.length?i:best,0)/3)*3)await p.screenshot({path:info.outputPath(`catalog-${offset}.png`),animations:'disabled'});
   await p.locator('.care-card').first().locator(':scope > button').click();
   await expect(p.locator('.care-card').first().locator('.care-meta')).toHaveText(batch[0].meta);
   await expect(p.locator('.care-card').first().locator('[data-care-expansion] .care-detail-meta')).toHaveCount(0);
  }
  expect(audit.fixtureWrites).toEqual([]);expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{await context.close();}
});
