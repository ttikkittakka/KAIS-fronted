import {test, expect} from '@playwright/test';

for (const [width,height] of [[1280,900],[390,844],[320,568],[320,480]]) test(`read-only completion preview ${width}x${height}`,async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Explicit viewport matrix');
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 const forbidden=[];
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.startsWith('/api/')||url.hostname.endsWith('supabase.co')||!['GET','HEAD'].includes(request.method())){
   forbidden.push({method:request.method(),path:url.pathname});return route.abort();
  }
  return route.continue();
 });
 try{
  const page=await context.newPage();await page.goto('http://localhost:3000/dev/care-completion');
  for(const count of [1,2,3]){
   await page.locator('summary').click();await page.getByRole('button',{name:`${count}/3 완료`,exact:true}).click();await page.locator('summary').click();
   await expect(page.locator('.completion-status')).toHaveText(`오늘 ${count}/3 완료`);
   await expect(page.locator('.completion-dots .is-complete')).toHaveCount(count);
   await expect(page.locator('.completion-scene .rive-plant--ready')).toBeVisible();await page.waitForTimeout(5000);
   const fit=await page.locator('.completion-screen').evaluate(el=>{
    const copy=el.querySelector('.completion-copy').getBoundingClientRect(),scene=el.querySelector('.completion-scene').getBoundingClientRect();
    return {overflow:el.scrollWidth>el.clientWidth,ordered:copy.bottom<=scene.top};
   });expect(fit).toEqual({overflow:false,ordered:true});
   await page.screenshot({path:info.outputPath(`preview-${count}-top.png`)});
   await page.locator('.completion-actions .primary-button').click();await expect(page.locator('aside [role=status]')).toContainText('미리보기:');
   await page.locator('.completion-actions .secondary-button').click();await expect(page.locator('aside [role=status]')).toContainText('미리보기:');
   await expect(page.locator('.completion-status')).toHaveText(`오늘 ${count}/3 완료`);
   await page.screenshot({path:info.outputPath(`preview-${count}-buttons.png`)});
  }
  await page.reload();await expect(page.locator('.completion-status')).toHaveText('오늘 3/3 완료');
  expect(forbidden).toEqual([]);
 }finally{await context.close();}
});
