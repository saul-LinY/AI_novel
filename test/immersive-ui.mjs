// React-template acceptance tests: real HTTP/NDJSON/persistence, isolated saves, no model calls.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../src/server.js';
import { projectRoot } from './helpers.js';
import { makeFrontendRuntime } from './fixtures/frontend-runtime.js';
const { chromium } = await import(process.env.NOVEL_PLAYWRIGHT_MODULE ?? 'playwright-core');
const engine=await chromium.launch({channel:'chrome',headless:true});
const page=await engine.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const posts=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/turn'))posts.push(r.postDataJSON());});
const dataDir=await mkdtemp(join(tmpdir(),'novel-ui-save-'));
const outputDir=process.env.NOVEL_QA_OUTPUT ?? join(projectRoot,'dogfood-output','redesign-20261008');
await mkdir(outputDir,{recursive:true});
const fixture=makeFrontendRuntime();
const app=await createAppServer({projectRoot,dataDir,runtimeFactory:fixture.runtimeFactory,logger:{error(){},warn(){}}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+app.server.address().port;
const results=[];
const pass=message=>{results.push(message);console.log('PASS '+message);};
const click=name=>page.getByRole('button',{name,exact:true}).click();
const screen=name=>page.locator('[data-screen="'+name+'"]').waitFor();
const state=()=>fetch(url+'/api/story').then(r=>r.json());
async function until(fn){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw new Error('Timed out waiting for fixture state');}
async function shot(name){await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:join(outputDir,name+'.png')});}
async function layout(label){const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+2,label+' horizontal overflow: '+JSON.stringify(size));}
async function waitTurn(count){await until(async()=>(await state()).events.length===count);await page.locator('[data-choice-id]').first().waitFor();}
async function act(text){const input=page.getByRole('textbox',{name:'下一步行动',exact:true});await input.fill(text);await click('提交');}
let failure;
try {
  const html=await fetch(url).then(r=>r.text());assert.match(html,/\/ui\/assets\/index-/);
  await page.goto(url,{waitUntil:'domcontentloaded'});await click('翻开前情');await screen('intro');
  await shot('01-introduction-desktop');
  await click('前情');assert.equal(await page.getByRole('button',{name:/第 \d+ 页漫画/}).count(),18);
  await click('第 18 页漫画');assert.match(await page.locator('figure figcaption').innerText(),/18/);
  await shot('02-comic-desktop');
  await click('人物');assert.equal(await page.locator('article').count(),12);
  await click('跳过');await screen('roles');
  const initialId=(await state()).events[0].id;
  await page.keyboard.press('End');await page.getByRole('heading',{name:'凯撒·加图索'}).waitFor();
  await page.keyboard.press('Home');await page.getByRole('heading',{name:'路明非'}).waitFor();
  await page.keyboard.press('ArrowRight');await page.getByRole('heading',{name:'上杉绘梨衣'}).waitFor();
  assert.equal((await state()).story.player,null);assert.equal((await state()).events[0].id,initialId);
  await shot('03-roles-desktop');
  pass('Template intro retains all 18 comics, 4 selectable roles, 8 NPCs; previews never write a save');
  await page.setViewportSize({width:390,height:844});await layout('mobile roles');await shot('04-roles-mobile');
  const box=await page.getByRole('button',{name:'以此身入局'}).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844);
  assert.equal(await page.getByRole('button',{name:'以此身入局'}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await click('以此身入局');await click('再看看');assert.equal((await state()).story.player,null);
  await click('以此身入局');await click('确认');await screen('reader');
  assert.equal((await state()).story.player.id,'erii');
  const raw=await state();assert.deepEqual(await page.locator('.choice-detail').allTextContents(),raw.events.at(-1).choices.map(c=>c.action));
  await layout('mobile reader');
  const mobileInput=await page.getByRole('textbox',{name:'下一步行动'}).boundingBox();
  const mobileSend=await page.getByRole('button',{name:'提交',exact:true}).boundingBox();
  assert.ok(mobileInput.width>=85,'Mobile input must remain usable');
  assert.ok(mobileSend.width<=48&&mobileSend.x+mobileSend.width<=390,'Send must remain a compact visible control');
  await shot('05-reader-mobile');
  await page.setViewportSize({width:1440,height:900});await shot('06-reader-desktop');
  pass('Role confirmation uses real server identity and openings; recommended action details match the API');
  await click('卷宗');const info=page.getByRole('dialog',{name:'随行手记'});await info.waitFor();
  const infoText=await info.innerText();for(const item of raw.state.inventory)assert.ok(infoText.includes(item.name));for(const fact of raw.state.knownFacts)assert.ok(infoText.includes(fact.text));
  await shot('07-story-info');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'卷宗');
  pass('Known facts, inventory and relationships remain available; dialogs trap and restore focus');
  await click('阅读设置');const size=page.getByRole('slider',{name:'字号'});await size.focus();await size.press('Home');for(let i=0;i<7;i++)await size.press('ArrowRight');
  await page.getByRole('button',{name:/专注.*素纸/}).click();await page.getByRole('button',{name:/关闭.*减弱动态/}).click();await shot('08-settings');
  await page.keyboard.press('Escape');await page.reload({waitUntil:'domcontentloaded'});await click('继续阅读');await screen('reader');
  assert.equal(await page.locator('[data-reading-scroll]>div').evaluate(el=>el.style.fontSize),'22px');
  assert.equal(await page.locator('[data-screen]').getAttribute('data-motion'),'off');assert.equal(await page.locator('[data-screen]').getAttribute('data-mode'),'focus');
  await shot('09-focus-reader');
  await click('阅读设置');await page.getByRole('button',{name:/剧场.*场景/}).click();await page.keyboard.press('Escape');
  await click('欣赏场景');assert.equal(await page.locator('[data-reading-scroll]').evaluate(el=>el.inert),true);await click('返回正文');
  pass('Reading size/mode/motion persist across reload; scene appreciation remains available');
  const firstChoice=(await state()).events.at(-1).choices[0];
  // The 行动/对话 switch sits above the cards and turns each recommendation into its spoken line.
  await click('对话');
  const spokenCard=page.locator('[data-choice-id="'+firstChoice.id+'"]');
  assert.ok(firstChoice.line,'opening choices carry a spoken line');
  assert.match(await spokenCard.innerText(),new RegExp(firstChoice.line.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(await spokenCard.innerText(),new RegExp(firstChoice.action.slice(0,8).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await click('行动');
  assert.match(await spokenCard.innerText(),new RegExp(firstChoice.action.slice(0,8).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.route('**/assets/scenes/dragon-raja/tokyo-street.png',route=>route.abort());
  await page.locator('[data-choice-id="'+firstChoice.id+'"]').click();await waitTurn(2);
  assert.deepEqual(posts.at(-1),{choiceId:firstChoice.id,branchId:raw.currentBranchId});assert.equal(fixture.controls.calls.at(-1).trustedChoice,true);
  await page.waitForFunction(()=>document.querySelector('[data-scene-image]')?.getAttribute('src')?.endsWith('/fallback.png'));
  await page.unroute('**/assets/scenes/dragon-raja/tokyo-street.png');
  await click('对话');const speech=page.getByRole('textbox',{name:'想说的话'});await speech.fill('一起走吧');await click('提交');await waitTurn(3);
  assert.equal(fixture.controls.calls.at(-1).action,'我说：「一起走吧」');assert.equal(fixture.controls.calls.at(-1).trustedChoice,false);
  await page.waitForFunction(()=>document.querySelector('[data-scene-image]')?.getAttribute('src')?.endsWith('/sky-observatory.png'));
  await click('行动');
  pass('Recommended choices preserve trusted choiceId; free dialogue reaches real API; broken scene images fall back');
  const input=page.getByRole('textbox',{name:'下一步行动'});await input.fill('中文输入中');const beforeIME=posts.length;
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});assert.equal(posts.length,beforeIME);await input.fill('');
  await act('等待取消');await page.getByRole('button',{name:'停止生成',exact:true}).waitFor();await click('停止生成');await page.locator('[data-choice-id]').first().waitFor();assert.equal((await state()).events.length,3);
  await act('失败一次');await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/暂不可用/);await click('重新落笔');await waitTurn(4);
  await act('不可执行');await page.getByRole('alert').waitFor();assert.equal((await state()).events.length,4);await click('修改行动');await input.fill('');
  pass('IME Enter does not submit; cancellable jobs, pre-write failures/retry and rejected actions preserve saves');
  await act('等待恢复');await page.getByRole('alert').waitFor();
  const prefix=await page.locator('[data-reading-scroll] article').last().innerText();assert.ok(prefix.includes('在门边停下脚步'));
  await click('接续当前回合');await waitTurn(5);
  const restored=await state();assert.equal(restored.events.at(-1).prose.split('在门边停下脚步').length-1,1);
  pass('Recoverable model failures retain displayed prose and resume the same persisted job without duplicate text');
  // While the agents work, the reader sees their own action, live seals, safe scene glimpses and an honest timer.
  await act('等待准备');await until(()=>Boolean(fixture.controls.releases.prepare));
  const pending=page.getByLabel('正在书写的回合');await pending.waitFor();
  assert.match(await pending.innerText(),/等待准备/);
  await page.locator('[data-action-dock]').getByText('窗外的雨声忽然密了',{exact:false}).waitFor();
  assert.equal(await page.locator('.agent-step-done').count(),3,'three analysis steps are marked done');
  assert.match(await page.locator('[data-action-dock]').innerText(),/查看现场[\s\S]*已完成[\s\S]*定稿执笔[\s\S]*(进行中|等待中)/);
  assert.match(await page.locator('[data-action-dock]').innerText(),/\d+ 秒/);
  assert.equal(await page.getByText(/%/).count(),0,'no fake progress percentage');
  await shot('03b-agents-working');
  fixture.controls.releases.prepare();await waitTurn(6);
  assert.equal(await page.getByLabel('正在书写的回合').count(),0,'pending card is replaced by the committed turn');
  pass('Waiting shows the submitted action, plain-language writing steps, safe beats and a real elapsed timer');
  await act('等待续写');await until(()=>Boolean(fixture.controls.releases.stream));
  const locked=page.getByRole('button',{name:'正文已锁定',exact:true});assert.equal(await locked.isDisabled(),true);
  const scroll=page.locator('[data-reading-scroll]');await scroll.evaluate(el=>{el.scrollTop=100;el.dispatchEvent(new Event('scroll'));});
  fixture.controls.releases.stream();await until(()=>Boolean(fixture.controls.releases.commit));
  assert.ok(Math.abs(await scroll.evaluate(el=>el.scrollTop)-100)<3,'Streaming must not pull history readers to bottom');
  const unfinished=(await fetch(url+'/api/turns/active').then(r=>r.json())).turnId;
  await page.reload({waitUntil:'domcontentloaded'});await click('继续阅读');await screen('reader');await locked.waitFor();
  assert.equal((await fetch(url+'/api/turns/active').then(r=>r.json())).turnId,unfinished);
  fixture.controls.releases.commit();await waitTurn(7);
  assert.equal((await state()).events.at(-1).prose.split('在门边停下脚步').length-1,1);
  pass('Prepared jobs cannot be cancelled; history scroll is stable; refresh resumes the server job exactly once');
  // Exercise every actual scene with the imported two-layer transition.
  for(let i=0;i<7;i++){
    const count=(await state()).events.length;await act('继续检查沿途的线索');await waitTurn(count+1);
    const current=await state();await page.waitForFunction(path=>document.querySelector('[data-scene-image]')?.getAttribute('src')?.endsWith(path),current.state.scene.image.src);
  }
  await click('故事介绍');await page.getByRole('dialog',{name:'故事介绍'}).waitFor();await page.getByRole('dialog',{name:'故事介绍'}).getByRole('button',{name:'前情',exact:true}).click();await shot('10-prelude-drawer');await page.keyboard.press('Escape');
  const countBeforeEnd=(await state()).events.length;
  await page.setViewportSize({width:320,height:568});await layout('small reader');await click('阅读设置');await layout('small settings');await page.keyboard.press('Escape');await shot('11-reader-small');
  await page.setViewportSize({width:390,height:844});await click('返回入口');await layout('saved entry mobile');await shot('12-entry-mobile');await click('继续阅读');
  await page.setViewportSize({width:1440,height:900});await act('正式收尾');await until(async()=>(await state()).state.status==='ended');await click('翻开结局');await screen('ending');await shot('13-ending');
  assert.equal((await state()).events.length,countBeforeEnd+1);assert.equal(await page.locator('[data-choice-id]:visible').count(),0);
  await click('回看全篇');const full=page.getByRole('dialog',{name:'东京出走'});await full.waitFor();assert.equal(await full.locator('article').count(),countBeforeEnd+1);await page.keyboard.press('Escape');
  await click('重新开始');await page.getByRole('dialog',{name:'重新开始故事'}).getByRole('button',{name:'保留此卷'}).click();assert.equal((await state()).state.status,'ended');
  await click('重新开始');await page.getByRole('dialog',{name:'重新开始故事'}).getByRole('button',{name:'重新开始',exact:true}).click();await screen('roles');assert.equal((await state()).story.player,null);
  pass('All seven scenes, mobile layouts, real structured endings, full-story review and confirmed reset work');
  await page.getByRole('button',{name:'故事介绍',exact:true}).click();await click('返回');await screen('entry');await shot('14-entry-desktop');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-screen]')?.getAttribute('data-motion')==='off');
  assert.equal(await page.locator('.anim-drift').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
  pass('System reduced motion is respected globally; no uncaught browser errors');
} catch(error) { failure=error;console.error(error);await shot('failure').catch(()=>{}); }
finally {
  await writeFile(join(outputDir,'verification.json'),JSON.stringify({ok:!failure,checks:results,pageErrors:errors,error:failure?.stack,screenshots:outputDir},null,2));
  await engine.close();app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));await rm(dataDir,{recursive:true,force:true});
}
if(failure)process.exitCode=1;
