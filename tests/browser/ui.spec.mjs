import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './fixtures.mjs';
import { installSession, guard, capture as captureScreen, ready, writeAudit, baseURL, samplePhoto } from './support.mjs';
const capture=(page,info,name)=>captureScreen(page,info,name,false);

test('blocked photo upload preserves preview and reads Snapshot without retry',async({browser},info)=>{
  const model=fixture('photo'),{context,page,audit}=await open(browser,info,model);
  let blocked=0,readsAfterBlock=0,failure=null;
  const responses=[];
  await context.route('**/api/account/photos',async route=>{
    if(route.request().method()==='POST'){blocked++;return route.abort('blockedbyclient');}
    return route.fallback();
  });
  page.on('request',r=>{if(blocked&&new URL(r.url()).pathname==='/api/account/records')readsAfterBlock++;});
  page.on('requestfailed',r=>{if(new URL(r.url()).pathname==='/api/account/photos'&&r.method()==='POST')failure=r.failure()?.errorText;});
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/account/photos'&&r.request().method()==='POST')responses.push(r.status());});
  try{
    await page.locator('.home-cta').click();
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'사진 선택',exact:true}).click();
    await(await chooser).setFiles(samplePhoto);
    const preview=page.getByAltText('저장 전 사진 미리보기');await expect(preview).toBeVisible();
    const initial=await preview.getAttribute('src');
    await page.getByRole('button',{name:'이 사진 저장하기',exact:true}).click();
    await expect(page.locator('.record-error[role="alert"]')).toContainText('사진 저장을 확인하지 못했어요.');
    await expect(preview).toHaveAttribute('src',initial);
    expect(blocked).toBe(1);expect(responses).toEqual([]);expect(failure).toMatch(/^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/);
    expect(readsAfterBlock).toBeGreaterThan(0);expect(model.state.hasPhoto).toBe(false);
    expect(model.day.record.revision).toBe(5);expect(model.day.record.stage).toBe('photo');
    expect(audit.fixtureWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
    await capture(page,info,'blocked-photo-preview-preserved');
    writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_READS_BLOCKED_UPLOAD',blocked,responses,failure,readsAfterBlock,previewPreserved:true});
  }finally{await context.close();}
});

async function open(browser,info,model) {
  const context=await browser.newContext({...info.project.use,baseURL});
  const audit=await guard(context,model.route);
  await context.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(model.user)}));
  await installSession(context,model.auth);
  const page=await context.newPage();await page.goto(baseURL);await ready(page);
  return {context,page,audit};
}
test('ui fixtures: four questions, file chooser, comment, growth and care rendering',async({browser},info)=>{
  const model=fixture(),{context,page,audit}=await open(browser,info,model);
  try{
    await capture(page,info,'fixture-home-initial');
    await page.locator('.home-scroll-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const scrolled=await capture(page,info,'fixture-home-scrolled');
    expect(scrolled.homeButtonOverlapsNavigation, 'home action clear after scrolling').toBe(false);
    await page.locator('.home-cta').click();
    await expect(page.locator('.choice-list button').first()).toBeVisible();
    await capture(page,info,'fixture-questions');
    for(let i=0;i<4;i++){
      const response=page.waitForResponse(r=>r.url().endsWith('/api/account/reflection/draft'));
      await page.locator('.choice-list button').nth(1).click();await response;
    }
    await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'사진 선택',exact:true}).click();
    await (await chooser).setFiles(samplePhoto);
    await expect(page.locator('#photo-comment')).toBeVisible();
    await page.locator('#photo-comment').fill('화면 검증용 코멘트 — 서버에는 전송되지 않습니다.');
    await page.getByRole('button',{name:'이 사진 저장하기',exact:true}).scrollIntoViewIfNeeded();
    await capture(page,info,'fixture-photo-preview');
    await page.getByRole('button',{name:'이 사진 저장하기',exact:true}).click();
    await expect(page.locator('.photo-editor')).toContainText('사진을 내 기록에 저장했어요.');
    await expect(page.locator('main')).toHaveAttribute('data-account-view','photo');
    await page.getByRole('button',{name:'성장하기로 이어가기',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-account-view','growth');
    const note = '모의 API에서만 저장하는 글 복원 검증';
    await page.locator('#account-saved-text').fill(note);
    await expect.poll(() => model.day.record.note).toBe(note);
    const savedComment = model.day.record.photo_comment;
    await page.reload();await ready(page);await page.locator('.home-cta').click();
    await expect(page.locator('#account-saved-text')).toHaveValue(note);
    expect(model.day.record.photo_comment).toBe(savedComment);
    await capture(page,info,'fixture-growth');
    await page.getByRole('button',{name:'오늘의 추천 행동 만나보기',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-account-view','care');
    await capture(page,info,'fixture-care');
    await page.reload();await ready(page);await page.locator('.home-cta').click();
    await expect(page.locator('main')).toHaveAttribute('data-account-view','care');
    writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_API',reloadRestored:true});
    expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  }finally{await context.close();}
});
test('ui fixtures: comment sizing, scrolling, contrast and save states',async({browser},info)=>{
  const model=fixture('photo',true),{context,page,audit}=await open(browser,info,model);
  try{
    await page.locator('.home-cta').click();const field=page.locator('#photo-comment');
    await expect(field).toBeVisible();await expect(page.getByRole('button',{name:'코멘트 저장',exact:true})).toBeDisabled();
    await field.fill('줄바꿈이 있는 화면 검증 코멘트\n두 번째 줄\n세 번째 줄\n네 번째 줄\n다섯 번째 줄');
    const save=page.getByRole('button',{name:'코멘트 저장',exact:true});await save.scrollIntoViewIfNeeded();
    const metrics=await page.evaluate(()=>{
      const field=document.querySelector('#photo-comment'),button=[...document.querySelectorAll('button')].find(b=>b.textContent==='코멘트 저장');
      const f=field.getBoundingClientRect(),b=button.getBoundingClientRect(),s=getComputedStyle(button);
      const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {inputHeight:f.height,inputScrolls:field.scrollHeight>field.clientHeight,buttonHeight:b.height,color:s.color,background:s.backgroundColor,centerUnobscured:!!hit&&button.contains(hit)};
    });
    expect(metrics.inputHeight).toBeGreaterThanOrEqual(72);expect(metrics.inputHeight).toBeLessThanOrEqual(88);expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);expect(metrics.inputScrolls).toBe(true);expect(metrics.centerUnobscured).toBe(true);
    fs.writeFileSync(info.outputPath('comment-metrics.json'),JSON.stringify(metrics,null,2));
    await capture(page,info,'fixture-comment-ready');
    model.state.writingDelay=1200;model.state.writingFailure=true;await save.click();
    await expect(page.getByRole('button',{name:'저장 중…',exact:true})).toBeDisabled();await capture(page,info,'fixture-comment-saving');
    const retry=page.getByRole('button',{name:'저장 실패 · 다시 저장',exact:true});await expect(retry).toBeEnabled();await capture(page,info,'fixture-comment-error');
    model.state.writingDelay=0;model.state.writingFailure=false;await retry.click();
    await expect(page.getByRole('button',{name:'✓ 저장 완료',exact:true})).toBeDisabled();await capture(page,info,'fixture-comment-saved');
    writeAudit(info,audit,{mode:'REAL_CHROME_MOCKED_API'});expect(audit.blockedWrites).toEqual([]);expect(audit.pageErrors).toBe(0);
  }finally{await context.close();}
});
