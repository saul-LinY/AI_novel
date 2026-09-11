// Run with `node test/immersive-ui.mjs`; requires playwright-core and Chrome.
// The fixture uses real HTTP and persistence contracts in a temporary save directory.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/server.js";
import { ending, projectRoot, proposal } from "./helpers.js";

const { chromium } = await import(process.env.NOVEL_PLAYWRIGHT_MODULE ?? "playwright-core");
const browserEngine = await chromium.launch({ channel: "chrome", headless: true });
const page = await browserEngine.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.setDefaultTimeout(12000);
const dataDir = await mkdtemp(join(tmpdir(), "novel-ui-save-"));
const outputDir = process.env.NOVEL_QA_OUTPUT ?? join(tmpdir(), "novel-ui-qa");
await mkdir(outputDir, { recursive: true });
const scenes = ["tokyo-street", "sky-observatory", "red-well", "genji-command", "rendezvous", "cassell-safehouse", "theme-hotel"];
let sceneIndex = 0;
let releaseStream;
let releaseCommit;
let activeRuntime;

class VisualFixtureRuntime {
  constructor({ storyPackage }) { this.storyPackage = storyPackage; activeRuntime = this; }
  async initialize() {}
  dispose() {}
  async abort() {
    if (!this.rejectWaiting) return false;
    this.rejectWaiting(new Error("cancelled"));
    this.rejectWaiting = null;
    return true;
  }
  async generateTurn(context, handlers) {
    handlers.onPhase("analyzing");
    if (context.action === "等待取消") await new Promise((resolve, reject) => { this.rejectWaiting = reject; });
    const locationId = scenes[sceneIndex++ % scenes.length];
    const location = this.storyPackage.locations.find((item) => item.id === locationId);
    const visual = location.states[0];
    const turnProposal = proposal({
      delta: { timeAdvanceMinutes: 5, locationId, sceneStateId: visual.id },
      ...(context.action === "正式收尾" ? {
        choices: [],
        ending: ending("early"),
        storyProgress: { failCurrentStage: true, evidence: "人物承担了提前退出的代价，这次旅程至此结束。" },
      } : {}),
    });
    const prepared = { scene: { locationId, locationName: location.name, stateId: visual.id, title: visual.title, image: visual.image, fallbackImage: location.fallbackImage } };
    await handlers.onPrepared(prepared);
    handlers.onPhase("narrating");
    const first = `你来到${location.name}，在门边停下脚步。绘梨衣跟着站住，把攥在手里的纸递过来，指了指上面画出的方向。\n\n你顺着她的手指看去，通道尽头的灯还亮着，远处偶尔传来车轮压过积水的声音。窗玻璃映出你们并肩站着的影子，门外的脚步声渐渐远去。\n\n“从这里过去。”你把纸折好，示意她留意身后的动静，然后侧身让开一条路。`;
    handlers.onSentence(first);
    handlers.onSentence("\n");
    if (context.action === "等待续写") await new Promise((resolve) => { releaseStream = resolve; });
    handlers.onSentence("\n");
    const last = "绘梨衣翻开随身的本子，把未说出口的话写在新的一页，举到你面前：一起走。\n\n你还没来得及回答，她已经收起笔，伸手拉住你的衣角。你们沿着亮着灯的一侧往前走，门在身后缓缓合拢。她的脚步比刚才轻了一些，却始终没有松开手，经过玻璃窗时还回头看了看。\n\n走到拐角时，她忽然停下来，示意你看向前面那扇半开的门。里面传来纸张翻动的轻响，你抬起手，示意她先留在身后。";
    handlers.onSentence(last);
    if (context.action === "等待续写") await new Promise((resolve) => { releaseCommit = resolve; });
    return { rejected: false, proposal: turnProposal, prose: `${first}\n\n${last}`, reports: {}, piEntryIds: {} };
  }
}

const app = await createAppServer({ projectRoot, dataDir, runtimeFactory: (args) => new VisualFixtureRuntime(args), logger: { error() {} } });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${app.server.address().port}`;

async function browser(...args) {
  const [command, ...values] = args;
  if (command === "set" && values[0] === "viewport") return page.setViewportSize({ width: Number(values[1]), height: Number(values[2]) });
  if (command === "set" && values[0] === "media") return page.emulateMedia({ reducedMotion: "reduce" });
  if (command === "open") return page.goto(values[0]);
  if (command === "reload") return page.reload();
  if (command === "eval") return { result: await page.evaluate(values[0]) };
  if (command === "screenshot") return page.screenshot({ path: values[0] });
  if (command === "click") return page.locator(values[0]).first().click();
  if (command === "hover") return page.locator(values[0]).first().hover();
  if (command === "fill") return page.locator(values[0]).fill(values[1]);
  if (command === "check") return page.locator(values[0]).check();
  if (command === "uncheck") return page.locator(values[0]).uncheck();
  if (command === "press") return page.keyboard.press(values[0]);
  if (command === "errors") return { errors: pageErrors };
  if (command === "close") return browserEngine.close();
  throw new Error(`Unsupported browser command: ${command}`);
}
async function evaluate(expression) { return (await browser("eval", expression)).result; }
async function waitFor(expression) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const diagnostics = await evaluate("({url:location.href,toast:document.querySelector('#toast')?.textContent, text:document.body.innerText.slice(-1200)})");
  throw new Error(`Timed out: ${expression}\n${JSON.stringify(diagnostics)}`);
}
async function screenshot(name) {
  await waitFor("document.body.dataset.sceneLoading !== 'true' && [...document.querySelectorAll('.world-image')].every(img => img.classList.contains('visible') ? img.complete && img.naturalWidth > 0 && Number(getComputedStyle(img).opacity) > .99 : Number(getComputedStyle(img).opacity) < .01)");
  await waitFor("!document.querySelector('#toast').classList.contains('visible')");
  await waitFor("!document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity)");
  await browser("screenshot", join(outputDir, `${name}.png`));
}
async function click(selector) { await browser("click", selector); }
async function storyState() { return fetch(`${url}/api/story`).then((response) => response.json()); }
const checks = [];
function pass(message) { checks.push(message); console.log(`PASS ${message}`); }

async function checkLayout(label) {
  const result = await evaluate(`(() => {
    const visible = (el) => !el.closest('[hidden], [inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const targets = [...document.querySelectorAll('button, h1, h2, textarea, .composer, .role-rail')].filter(visible);
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      clipped: targets.filter(el => el.scrollWidth > el.clientWidth + 3).map(el => el.id || el.className),
      broken: [...document.images].filter(el => el.getAttribute('src') && el.complete && !el.naturalWidth).map(el => el.src) };
  })()`);
  assert.equal(result.overflow, false, `${label}: viewport overflow`);
  assert.deepEqual(result.clipped, [], `${label}: clipped controls`);
  assert.deepEqual(result.broken, [], `${label}: broken assets`);
}

try {
  await browser("set", "viewport", "1440", "900");
  await browser("open", url);
  await waitFor("!document.querySelector('#gateway-enter').disabled");
  await checkLayout("desktop gateway");
  await screenshot("01-gateway-desktop");
  await click("#gateway-cast");
  assert.equal(await evaluate("document.querySelector('#onboarding').dataset.step"), "roles");
  assert.equal((await storyState()).story.player, null);
  await click("#onboarding-home");
  await click("#gateway-enter");
  assert.equal(await evaluate("document.querySelector('#onboarding').dataset.step"), "roles");
  for (const id of ["lu-mingfei", "erii", "gen-chisei", "caesar"]) {
    await click(`[data-role-preview="${id}"]`);
    assert.equal((await storyState()).story.player, null, "A preview must not select a player");
    assert.equal(await evaluate(`document.querySelector('[data-role-preview="${id}"]').getAttribute('aria-pressed')`), "true");
  }
  await click('[data-role-preview="erii"]');
  await browser("press", "ArrowRight");
  assert.equal(await evaluate("document.querySelector('[data-role-preview=\"gen-chisei\"]').getAttribute('aria-pressed')"), "true");
  assert.equal((await storyState()).story.player, null);
  await browser("press", "Home");
  assert.equal(await evaluate("document.querySelector('[data-role-preview=\"lu-mingfei\"]').getAttribute('aria-pressed')"), "true");
  await browser("press", "End");
  assert.equal(await evaluate("document.querySelector('[data-role-preview=\"caesar\"]').getAttribute('aria-pressed')"), "true");
  await click('[data-role-preview="erii"]');
  await checkLayout("desktop role selection");
  await screenshot("02-role-desktop");
  pass("Entry opens role selection directly; all four previews preserve the save");

  await browser("set", "viewport", "390", "844");
  await waitFor("Boolean(document.querySelector('#role-dock [data-role-id]'))");
  await checkLayout("mobile role selection");
  const confirmation = await evaluate(`(() => {
    const controls = document.querySelectorAll('[data-role-id]');
    const box = controls[0].getBoundingClientRect();
    return { count: controls.length, visible: box.top >= 0 && box.bottom <= innerHeight, inDock: Boolean(controls[0].closest('#role-dock')) };
  })()`);
  assert.deepEqual(confirmation, { count: 1, visible: true, inDock: true });
  pass("Cover cast entry and keyboard previews preserve identity; the single mobile confirmation stays within reach");
  await screenshot("03-role-mobile");
  await click('[data-role-id="erii"]');
  await waitFor("document.body.dataset.view === 'story'");
  assert.equal((await storyState()).story.player.id, "erii");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.choice-detail')].map(el => el.textContent)"), (await storyState()).events.at(-1).choices.map(choice => choice.action));
  await checkLayout("mobile reading");
  await screenshot("04-reading-mobile");
  await browser("set", "viewport", "1440", "900");
  await screenshot("05-reading-desktop");
  pass("Role confirmation enters the matching story; desktop and mobile layouts fit");

  const openingId = (await storyState()).events[0].id;
  await click("#onboarding-replay");
  await click('#onboarding-chapters [data-onboarding-index="24"]');
  await click('[data-role-id="erii"]');
  assert.equal((await storyState()).events[0].id, openingId, "Continuing the selected role must not recreate the opening");

  await click("#state-toggle");
  assert.equal(await evaluate("document.querySelector('#state-panel').inert"), false);
  assert.equal(await evaluate("document.querySelector('.app-header').inert"), true);
  await screenshot("06-state-drawer");
  await click("#state-panel [data-close-panel]");
  assert.equal(await evaluate("document.body.classList.contains('state-open')"), false);
  await click("#state-toggle");
  await browser("press", "Escape");
  assert.equal(await evaluate("document.activeElement.id"), "state-toggle");
  await click("#settings-toggle");
  await evaluate("document.querySelector('#reading-size').value = 22; document.querySelector('#reading-size').dispatchEvent(new Event('input', {bubbles:true}));");
  await click('button[data-reading-mode="focus"]');
  await browser("check", "#motion-reduced");
  await checkLayout("reading settings");
  await screenshot("07-settings");
  await browser("press", "Escape");
  await browser("reload");
  await waitFor("!document.querySelector('#gateway-enter').disabled");
  await click("#gateway-enter");
  assert.equal(await evaluate("document.body.dataset.readingMode"), "focus");
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--reading-size')"), "22px");
  assert.equal(await evaluate("document.body.classList.contains('reduce-motion')"), true);
  await click("#scene-reveal");
  assert.equal(await evaluate("document.querySelector('#reading-panel').inert"), true);
  await browser("press", "Escape");
  assert.equal(await evaluate("document.querySelector('#reading-panel').inert"), false);
  pass("Drawers trap background focus; Escape restores focus; reading preferences persist");

  await click("#settings-toggle");
  await click('button[data-reading-mode="cinematic"]');
  await evaluate("document.querySelector('#reading-size').value = 18; document.querySelector('#reading-size').dispatchEvent(new Event('input', {bubbles:true}));");
  await browser("uncheck", "#motion-reduced");
  await browser("press", "Escape");
  for (const locationId of scenes) {
    const before = (await storyState()).events.length;
    await click(".choice-button");
    await waitFor(`document.querySelectorAll('.story-segment-boundary:not(.live-turn)').length === ${before + 1}`);
    assert.equal((await storyState()).state.scene.locationId, locationId);
    await waitFor(`document.body.dataset.sceneSource === '/assets/scenes/dragon-raja/${locationId}.png'`);
    await checkLayout(`scene ${locationId}`);
    if (locationId === "red-well") await screenshot("08-red-well");
  }
  pass("All seven real scene events replace the full-screen background without broken images");

  const savedEvents = (await storyState()).events;
  const expectedText = savedEvents.map((event) => event.prose.replace(/[\r\n]/g, ""));
  const readParagraphs = () => evaluate("[...document.querySelectorAll('.story-segment')].map(segment => [...segment.querySelectorAll('p')].map(p => p.textContent))");
  const displayedParagraphs = await readParagraphs();
  assert.deepEqual(displayedParagraphs.map((paragraphs) => paragraphs.join("")), expectedText, "Merging paragraphs must preserve all prose");
  assert.ok(savedEvents.slice(1).every((event) => event.prose.split(/\n+/).length === 6));
  assert.ok(displayedParagraphs.slice(1).every((paragraphs) => paragraphs.length === 2), "Six short source paragraphs should display as two substantial paragraphs");
  assert.equal(await evaluate("document.querySelector('.turn-action')"), null);
  assert.ok(!(await evaluate("document.querySelector('.story-prose').innerText")).includes(savedEvents.at(-1).action));
  const gaps = await evaluate(`(() => {
    const boundaries = [...document.querySelectorAll('.story-segment-boundary')];
    const current = boundaries.at(-1);
    const previous = boundaries.at(-2).querySelector('p:last-child');
    const [first, second] = current.querySelectorAll('p');
    return { betweenTurns: first.getBoundingClientRect().top - previous.getBoundingClientRect().bottom,
      betweenParagraphs: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
      indentation: parseFloat(getComputedStyle(first).textIndent) / parseFloat(getComputedStyle(first).fontSize) };
  })()`);
  assert.equal(gaps.betweenParagraphs, 0, "Paragraphs must have no extra blank space");
  assert.equal(gaps.betweenTurns, 0, "Turn boundaries must have no extra blank space");
  assert.equal(gaps.indentation, 2, "Natural paragraphs should be distinguished by a two-character indent");
  await screenshot("07a-continuous-reading-desktop");
  await browser("set", "viewport", "390", "844");
  await checkLayout("mobile continuous reading");
  await screenshot("07b-continuous-reading-mobile");
  await browser("set", "viewport", "1440", "900");
  await browser("reload");
  await waitFor("!document.querySelector('#gateway-enter').disabled");
  await click("#gateway-enter");
  assert.deepEqual(await readParagraphs(), displayedParagraphs);
  assert.equal(await evaluate("document.querySelector('.turn-action')"), null);
  pass("Six short paragraphs become two on screen without changing prose; reloads preserve grouping, zero paragraph gaps and first-line indentation");

  await page.route("**/qa-slow-scene.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ path: join(projectRoot, "public/assets/scenes/dragon-raja/red-well.png"), contentType: "image/png" });
  });
  await evaluate("window.novelAtmosphere.setScene({src:'/qa-slow-scene.png',mood:'danger'}); window.novelAtmosphere.setScene({src:'/assets/scenes/dragon-raja/tokyo-street.png',mood:'rain'}); true;");
  await waitFor("document.body.dataset.sceneLoading === 'false'");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(await evaluate("document.body.dataset.sceneSource"), "/assets/scenes/dragon-raja/tokyo-street.png");
  const weatherPixels = () => evaluate("document.querySelector('#weather').getContext('2d').getImageData(0,0,300,300).data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0)");
  const firstRain = await weatherPixels();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const secondRain = await weatherPixels();
  assert.ok(firstRain > 0 || secondRain > 0, "Weather canvas should contain rain pixels");
  assert.notEqual(firstRain, secondRain, "Rain should move between frames");
  await page.route("**/qa-broken-scene.png", (route) => route.fulfill({ status: 404, body: "missing" }));
  await evaluate("window.novelAtmosphere.setScene({src:'/qa-broken-scene.png',fallback:'/assets/scenes/dragon-raja/fallback.png'}); true;");
  await waitFor("document.body.dataset.sceneLoading === 'false'");
  assert.ok((await evaluate("document.querySelector('.world-image.visible').src")).endsWith("/fallback.png"));
  await evaluate("window.novelAtmosphere.setScene({src:'/assets/scenes/dragon-raja/theme-hotel.png',mood:'quiet'}); true;");
  assert.equal(await evaluate("document.querySelectorAll('[data-audio-toggle], #audio-enabled').length"), 0);
  pass("Late images cannot overwrite newer scenes; failed images fall back; rain animates and audio controls are absent");

  await browser("fill", "#action-input", "等待续写");
  await click("#send-action");
  await waitFor("Boolean(document.querySelector('.streaming-segment.has-prose'))");
  await waitFor("document.querySelectorAll('.streaming-segment p').length === 1");
  await evaluate("window.qaFirstParagraph = document.querySelector('.streaming-segment p');");
  const streamedFirst = await evaluate("window.qaFirstParagraph.textContent");
  await evaluate("document.querySelector('#story-scroll').scrollTop = 0;");
  await waitFor("!document.querySelector('#latest-turn').hidden");
  releaseStream();
  await waitFor("document.querySelectorAll('.streaming-segment p').length === 2");
  assert.equal(await evaluate("window.qaFirstParagraph === document.querySelector('.streaming-segment p')"), true);
  assert.equal(await evaluate("window.qaFirstParagraph.textContent"), streamedFirst);
  const streamedParagraphs = await evaluate("[...document.querySelectorAll('.streaming-segment p')].map(p => p.textContent)");
  releaseCommit();
  await waitFor("!document.querySelector('#action-input').disabled");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.story-segment-boundary:last-child p')].map(p => p.textContent)"), streamedParagraphs);
  assert.equal(await evaluate("document.querySelector('#story-scroll').scrollTop"), 0);
  await click("#latest-turn");
  await waitFor("document.querySelector('#latest-turn').hidden");
  pass("Streaming preserves completed paragraphs across split blank lines and save, without forcing a scroll to the bottom");

  const beforeCancel = (await storyState()).events.length;
  await browser("fill", "#action-input", "等待取消");
  await click("#send-action");
  await waitFor("!document.querySelector('#stop-action').hidden");
  while (!activeRuntime.rejectWaiting) await new Promise((resolve) => setTimeout(resolve, 20));
  await click("#stop-action");
  await waitFor("!document.querySelector('#action-input').disabled");
  assert.equal((await storyState()).events.length, beforeCancel);
  pass("Stopping a turn before preparation leaves the persisted story unchanged");

  await click("#onboarding-replay");
  await click('#onboarding-chapters [data-onboarding-index="1"]');
  await waitFor("document.querySelector('.comic-page img').complete");
  await screenshot("09-comic-desktop");
  await browser("set", "viewport", "390", "844");
  await checkLayout("mobile comic");
  await screenshot("10-comic-mobile");
  await click("#onboarding-home");
  await screenshot("11-gateway-mobile");
  await checkLayout("mobile gateway");
  await browser("set", "viewport", "320", "568");
  await checkLayout("small gateway");
  await click("#gateway-enter");
  await checkLayout("small reading");
  await click("#state-toggle");
  await checkLayout("small state drawer");
  await browser("press", "Escape");
  await click("#settings-toggle");
  await evaluate("document.querySelector('#reading-size').value = 24; document.querySelector('#reading-size').dispatchEvent(new Event('input', {bubbles:true}));");
  await browser("press", "Escape");
  await checkLayout("small reading at largest text");
  await screenshot("12-small-reading");
  pass("Comic replay and layouts at 390px and 320px fit, including the largest reading text");

  await browser("fill", "#action-input", "正式收尾");
  await click("#send-action");
  await waitFor("!document.querySelector('#story-ending').hidden");
  assert.equal((await storyState()).state.status, "ended");
  assert.equal(await evaluate("document.querySelector('#action-form').hidden"), true);
  assert.equal(await evaluate("document.querySelectorAll('.choice-button').length"), 0);
  await checkLayout("small story ending");
  await screenshot("13-ending-small");
  await browser("set", "viewport", "1440", "900");
  await evaluate("document.querySelector('#story-scroll').scrollTop = document.querySelector('#story-scroll').scrollHeight;");
  await checkLayout("desktop story ending");
  await screenshot("14-ending-desktop");
  const completedEvents = (await storyState()).events;
  await browser("reload");
  await waitFor("!document.querySelector('#gateway-enter').disabled");
  assert.equal(await evaluate("document.querySelector('#gateway-enter-label').textContent"), "重温故事");
  await click("#gateway-enter");
  assert.equal(await evaluate("document.querySelector('#story-ending').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#action-form').hidden"), true);
  assert.deepEqual((await storyState()).events, completedEvents);
  pass("Ending hides choices and input on small and desktop screens; reload offers replay and preserves the completed story");

  await browser("set", "media", "reduced-motion");
  await browser("reload");
  await waitFor("!document.querySelector('#gateway-enter').disabled");
  assert.equal(await evaluate("document.body.classList.contains('reduce-motion')"), true);
  const canvas = await evaluate("Array.from(document.querySelector('#weather').getContext('2d').getImageData(0,0,50,50).data).some(Boolean)");
  assert.equal(canvas, false);
  pass("System reduced motion stops the animated weather canvas");
  const errors = await browser("errors");
  assert.deepEqual(errors.errors ?? [], []);
  await writeFile(join(outputDir, "verification.json"), JSON.stringify({ checks, screenshots: outputDir, errors }, null, 2));
  console.log(`Screenshots and results: ${outputDir}`);
} finally {
  releaseStream?.();
  releaseCommit?.();
  await browser("close").catch(() => {});
  app.server.closeAllConnections();
  await new Promise((resolve) => app.server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
