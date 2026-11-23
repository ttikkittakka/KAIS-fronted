import {test,expect} from '@playwright/test';
import {fixture} from './fixtures.mjs';
import {guard,installSession,ready,baseURL} from './support.mjs';

for(const [width,height] of [[1280,900],[390,844],[320,568]])test(`plant silhouette ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewport matrix');
 const context=await browser.newContext({baseURL,viewport:{width,height},hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'}),m=fixture('care'),audit=await guard(context,m.route);
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m.user)}));await installSession(context,m.auth);
 try{
 const p=await context.newPage();await p.goto(baseURL);await ready(p);
 const plant=p.locator('.hero-plant .rive-plant');await expect(plant).toHaveClass(/ready/);await p.waitForTimeout(4000);
 // Observe the real Rive runtime's Play events, not DOM clicks or a mock animation.
 await plant.evaluate(el=>{
  let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))],rive;
  for(;fiber&&!rive;fiber=fiber.return){for(let h=fiber.memoizedState;h&&typeof h==='object';h=h.next){const v=h.memoizedState;if(v&&typeof v.play==='function'&&typeof v.on==='function'&&v.stateMachineNames){rive=v;break;}}}
  if(!rive)throw Error('Real Rive instance unavailable');window.__plantPlays=[];rive.on('play',event=>window.__plantPlays.push(event.data));
 });
 const count=()=>p.evaluate(()=>window.__plantPlays.filter(d=>JSON.stringify(d).includes('touch')).length);
 const points=()=>plant.locator('canvas').evaluate(c=>{
  const temp=document.createElement('canvas');temp.width=c.width;temp.height=c.height;const ctx=temp.getContext('2d');ctx.drawImage(c,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data,r=c.getBoundingClientRect();
  const opaque=[];for(let y=0;y<c.height;y+=3)for(let x=0;x<c.width;x+=3)if(d[(y*c.width+x)*4+3]>200)opaque.push([x,y]);
  if(!opaque.length)throw Error('No plant pixels');const minY=Math.min(...opaque.map(p=>p[1])),maxY=Math.max(...opaque.map(p=>p[1]));
  const row=ratio=>{const y=minY+(maxY-minY)*ratio;const candidates=opaque.filter(p=>Math.abs(p[1]-y)<4);return candidates[Math.floor(candidates.length/2)];};
  const xy=point=>({x:r.left+point[0]/c.width*r.width,y:r.top+point[1]/c.height*r.height});
  return {leaf:xy(row(.12)),pot:xy(row(.65)),empty:{x:r.left+4,y:r.top+r.height*.65},top:{x:r.left+r.width/2,y:r.top+8}};
 });
 const click=async(point)=>{if(width<600)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);};
 for(const target of ['pot','leaf']){const before=await count();await click((await points())[target]);await expect.poll(count).toBe(before+1);await p.waitForTimeout(1800);}
 const before=await count();for(const target of ['empty','top'])await click((await points())[target]);
 const cloud=await p.locator('.cloud-shape.one').boundingBox();if(cloud)await click({x:cloud.x+cloud.width/2,y:cloud.y+cloud.height/2});
 await p.mouse.click(25,75);await p.waitForTimeout(250);expect(await count()).toBe(before);
 const point=(await points()).pot;
 if(width<600){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-60}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(point.x+50,point.y-40,{steps:6});await p.mouse.up();}
 await p.waitForTimeout(250);expect(await count()).toBe(before);
 await plant.focus();await p.keyboard.press('Enter');await expect.poll(count).toBe(before+1);
 await p.screenshot({path:info.outputPath('home-hit-area.png')});
 const navigationBefore=await count();await p.locator('.bottom-nav button').last().click();await expect(p.locator('.garden-history-screen')).toBeVisible();expect(await count()).toBe(navigationBefore);
 expect(audit.fixtureWrites).toEqual([]);expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{await context.close();}
});
