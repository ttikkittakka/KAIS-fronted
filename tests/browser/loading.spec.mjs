import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './fixtures.mjs';
import { guard, installSession, capture, ready, baseURL, writeAudit } from './support.mjs';

test('loading: auth initialization and account switch never show the previous account',async({browser},info)=>{
 const a=fixture('photo',true),b=fixture('photo',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 b.day.sunshineBalance=30;
 let model=a,releaseSwitch;
 const switchGate=new Promise(resolve=>{releaseSwitch=resolve;});
 const context=await browser.newContext({...info.project.use,baseURL});
 const audit=await guard(context,async(url,method,request)=>{if(model===b && method==='GET')await switchGate;return model.route(url,method,request);});
 await context.route('**/auth/v1/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/logout'))return route.fulfill({status:204});
   if(path.endsWith('/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b.auth.session)});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)});
 });
 await installSession(context,a.auth);
 await context.addInitScript(key=>{
   if(location.origin!=='http://localhost:3000')return;
   if(!sessionStorage.getItem('auth-delay-tested')){
     sessionStorage.setItem('auth-delay-tested','1');
     const request=navigator.locks.request.bind(navigator.locks);
     const gate=new Promise(resolve=>{window.__releaseLoadingAuth=resolve;});
     navigator.locks.request=(name,...args)=>name==='lock:'+key?gate.then(()=>request(name,...args)):request(name,...args);
   }
 },a.auth.storageKey);
 const page=await context.newPage();
 try{
   await page.goto(baseURL);
   await expect(page.locator('[data-loading-layout=full]')).toBeVisible();
   await expect(page.locator('[data-account-view]')).toHaveCount(0);
   await capture(page,info,'loading-auth-initialization',false);
   await page.evaluate(()=>window.__releaseLoadingAuth());await ready(page);
   await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();
   await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
   model=b;
   await page.locator('input[name=email]').fill('browser-fixture@example.invalid');await page.locator('input[name=password]').fill('browser-fixture-only');
   await page.getByRole('button',{name:'로그인',exact:true}).click();
   await expect(page.locator('[data-loading-layout=full]')).toBeVisible();await expect(page.locator('.home-cta')).toHaveCount(0);
   await capture(page,info,'loading-account-switch',false);
   releaseSwitch();await ready(page);
   // Reload reads B's fixture again, never the previous account's retained presentation.
   await page.reload();await ready(page);
   writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_AUTH_AND_READS',accountSwitchClearedPrevious:true});expect(audit.blockedWrites).toEqual([]);expect(audit.fixtureWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{releaseSwitch();await context.close();}
});

test('loading: centered first load, refresh stability, inline history, failure and retry',async({browser},info)=>{
 const model=fixture('photo',true);
 let hold=true,fail=false,release;
 let gate=new Promise(resolve=>{release=resolve;});
 const context=await browser.newContext({...info.project.use,baseURL});
 const audit=await guard(context,async(url,method,request)=>{
   if(method==='GET' && ['/api/account/garden','/api/account/records'].includes(url.pathname)){
     if(hold)await gate;
     if(fail)return {status:503,contentType:'application/json',body:'{}'};
   }
   return model.route(url,method,request);
 });
 await context.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
 await installSession(context,model.auth);
 const page=await context.newPage();
 try{
   await page.goto(baseURL);
   const loader=page.locator('[data-loading-layout=full]');
   await expect(loader).toBeVisible();await expect(loader.getByRole('status')).toHaveCSS('opacity','1');
   const metrics=await loader.evaluate(el=>{
     const frame=el.closest('.phone-frame').getBoundingClientRect(),box=el.querySelector('[role=status]').getBoundingClientRect();
     return {dx:Math.abs((box.left+box.width/2)-(frame.left+frame.width/2)),dy:Math.abs((box.top+box.height/2)-(frame.top+frame.height/2)),scrolls:el.scrollHeight>el.clientHeight};
   });
   expect(metrics.dx).toBeLessThan(3);expect(metrics.dy).toBeLessThan(3);expect(metrics.scrolls).toBe(false);
   await capture(page,info,'loading-centered',false);fs.writeFileSync(info.outputPath('loading-metrics.json'),JSON.stringify(metrics,null,2));
   await page.emulateMedia({reducedMotion:'reduce'});
   expect(await loader.locator('svg').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
   await capture(page,info,'loading-reduced-motion',false);
   hold=false;release();await ready(page);
   await page.getByRole('button',{name:'설정',exact:true}).click();
   hold=true;gate=new Promise(resolve=>{release=resolve;});
   await page.getByRole('button',{name:'기록 새로고침'}).click();
   await expect(page.locator('.phone-frame')).toHaveAttribute('inert','');
   await expect(loader).toHaveCount(0);await expect(page.getByRole('button',{name:'기록 새로고침'})).toBeVisible();
   hold=false;release();await expect(page.locator('.phone-frame')).not.toHaveAttribute('inert','');
   await page.reload();await ready(page);
   hold=true;gate=new Promise(resolve=>{release=resolve;});
   await page.getByRole('navigation').getByRole('button',{name:'기록',exact:true}).click();
   await expect(page.locator('[data-loading-layout=compact]')).toBeVisible();
   await expect(page.locator('.calendar-card')).toBeVisible();await expect(loader).toHaveCount(0);
   await page.locator('[data-loading-layout=compact]').scrollIntoViewIfNeeded();
   await capture(page,info,'loading-calendar-inline',false);
   hold=false;release();await expect(page.locator('[data-loading-layout=compact]')).toHaveCount(0);
   fail=true;await page.reload();await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeVisible();await expect(loader).toHaveCount(0);
   fail=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await ready(page);
   writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_READS',refreshKeptScreen:true,errorRecovery:true});expect(audit.blockedWrites).toEqual([]);expect(audit.fixtureWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
 }finally{hold=false;release();await context.close();}
});
