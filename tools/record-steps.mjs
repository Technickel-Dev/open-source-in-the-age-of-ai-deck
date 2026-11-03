// Records short screen clips of each stage of "Six steps to your first PR" on GitHub, for the steps slide.
// Each clip is saved as assets/img/steps/step-NN-name.mp4 and the slide swaps its screenshot for it automatically.
//
//   node tools/record-steps.mjs --login                      sign in once (opens a browser, waits for you); saves .auth/github.json
//   node tools/record-steps.mjs --repo owner/repo --issue 12 --fork you/repo --branch better-readme
//   node tools/record-steps.mjs --only 3                     record just step 3 (comma-separate for several)
//
//   --repo    the upstream project                     (default Technickel-Dev/low-poly)
//   --issue   issue number to open in step 1           (default: the issues list)
//   --fork    your fork, for steps 4-5                 (default: same as --repo)
//   --branch  your branch, for steps 4-6               (default: main)
//   --file    file to edit in step 4                   (default: README.md)
//   --headed  watch it record
//   --light   record in GitHub's light theme (the default is dark, to match the deck)
//
// It is a DRY RUN: every request that isn't a GET is blocked, so nothing is forked, committed, commented on or opened.
// Steps 1, 2, 5 and 6 need a sign-in to show the real forms, so it refuses to record unless you are signed in (it checks the
// saved session first); --allow-signed-out records what a visitor sees instead. Needs Chrome or Edge (BROWSER=msedge to switch) and ffmpeg on PATH. Frames come from Chrome's own
// screencast, so there is nothing extra to download.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = path.join(root, '.auth', 'github.json');
const OUT = path.join(root, 'assets', 'img', 'steps');
const SIZE = { width: 1100, height: 650 };

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const cfg = {
  repo: opt('repo', 'Technickel-Dev/low-poly'),
  issue: opt('issue', ''),
  branch: opt('branch', 'main'),
  file: opt('file', 'README.md'),
};
cfg.fork = opt('fork', cfg.repo);
// step 4 keeps the cat gif on the slide and step 5 is just the git commands, so neither is recorded by default;
// step 6's clip opens with step 5's "1 commit ahead" banner, then goes on to the pull request form
const only = opt('only', '') ? opt('only', '').split(',').map(Number) : [1, 2, 3, 6];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// GitHub puts the signed-in user's name in a meta tag on every page
const signedInAs = (page) => page.evaluate(() => document.querySelector('meta[name="user-login"]')?.content || '');

async function launch() {
  const channels = [process.env.BROWSER, 'chrome', 'msedge'].filter(Boolean);
  let err;
  for (const channel of channels) {
    try { return await chromium.launch({ channel, headless: !flag('headed') && !flag('login') }); } catch (e) { err = e; }
  }
  throw new Error(`Could not start Chrome or Edge: ${err?.message}`);
}

// ── sign in once and keep the session ────────────────────────────────────────────────────────────
if (flag('login')) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: SIZE, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('https://github.com/login');
  console.log('Sign in to GitHub in the browser window (you have 5 minutes)…');
  let user = '';
  for (let i = 0; i < 150 && !user; i++) {
    await pause(2000);
    if (!/github\.com\/(login|session|sessions|sso|device)/.test(page.url())) user = await signedInAs(page).catch(() => '');
  }
  if (!user) { await browser.close(); console.error('Timed out without a sign-in.'); process.exit(1); }
  fs.mkdirSync(path.dirname(AUTH), { recursive: true });
  await ctx.storageState({ path: AUTH });
  fs.chmodSync(AUTH, 0o600);
  await browser.close();
  console.log(`Signed in as ${user}. Saved ${path.relative(root, AUTH)} (it is git-ignored).`);
  process.exit(0);
}

const authed = fs.existsSync(AUTH);
if (!authed && !flag('allow-signed-out')) {
  console.error('Not signed in. Run  node tools/record-steps.mjs --login  first (or pass --allow-signed-out to record what a visitor sees).');
  process.exit(1);
}
console.log(authed ? 'Using the saved sign-in.' : 'Recording signed out (steps 1, 2, 4, 5 and 6 will show less).');

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
// a visible mouse pointer (an arrow, with a ripple on click), since screen recordings of a headless browser don't show one
const CURSOR = `(() => {
  const arrow = document.createElement('div');
  arrow.innerHTML = '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 29 L10 22.5 L15 34 L20 31.8 L15 20.5 L25 20.5 Z" fill="#fff" stroke="#111" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  arrow.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:-80px;top:-80px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));transform-origin:3px 2px;transition:transform .09s';
  const ripple = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;left:' + x + 'px;top:' + y + 'px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #38bdf8;opacity:.9;transition:transform .5s ease-out,opacity .5s ease-out';
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(4)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  };
  const add = () => document.documentElement.appendChild(arrow);
  document.documentElement ? add() : addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove', (e) => { arrow.style.left = e.clientX + 'px'; arrow.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', (e) => { arrow.style.transform = 'scale(.85)'; ripple(e.clientX, e.clientY); }, true);
  addEventListener('mouseup', () => { arrow.style.transform = 'scale(1)'; }, true);
})();`;

// a hand-like cursor path: a curved (cubic Bezier) route that eases in and out, with a touch of tremor and a small overshoot on long moves
const pos = { x: SIZE.width * 0.6, y: SIZE.height * 0.45 };
const rand = (a, b) => a + Math.random() * (b - a);
async function moveTo(page, x, y) {
  const { x: x0, y: y0 } = pos;
  const dist = Math.hypot(x - x0, y - y0);
  if (dist < 2) return;
  const bend = dist * rand(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1);
  const nx = -(y - y0) / dist, ny = (x - x0) / dist;
  const c1 = { x: x0 + (x - x0) * 0.3 + nx * bend, y: y0 + (y - y0) * 0.3 + ny * bend };
  const c2 = { x: x0 + (x - x0) * 0.75 + nx * bend * 0.4, y: y0 + (y - y0) * 0.75 + ny * bend * 0.4 };
  const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  const n = Math.max(14, Math.min(46, Math.round(dist / 14)));
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n), u = 1 - t;
    const px = u ** 3 * x0 + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * x;
    const py = u ** 3 * y0 + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * y;
    const shake = i < n ? rand(-0.7, 0.7) : 0;
    await page.mouse.move(px + shake, py + shake);
    await pause(rand(8, 16));
  }
  pos.x = x; pos.y = y;
}
// move the cursor to an element; if GitHub's markup has changed and it isn't found, carry on so the clip still saves
async function glide(page, locator, { dx = 0, dy = 0 } = {}) {
  try {
    await locator.waitFor({ state: 'visible', timeout: 6000 });
    let b = await locator.boundingBox();
    if (!b) return;
    // bring an off-screen target into view with an eased scroll rather than an instant jump
    if (b.y + b.height > SIZE.height - 50 || b.y < 50) {
      const dy = b.y + b.height / 2 - SIZE.height * 0.55;
      await page.evaluate((dy) => new Promise((done) => {
        const y0 = scrollY, t0 = performance.now(), ms = Math.min(1100, 450 + Math.abs(dy) * 0.9);
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / ms), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
          scrollTo(0, y0 + dy * e);
          p < 1 ? requestAnimationFrame(tick) : done();
        };
        requestAnimationFrame(tick);
      }), dy);
      await pause(200);
      b = await locator.boundingBox();
      if (!b) return;
    }
    const tx = b.x + b.width * rand(0.35, 0.65) + dx, ty = b.y + b.height * rand(0.35, 0.65) + dy;
    // long moves swing a little past the target and settle back
    if (Math.hypot(tx - pos.x, ty - pos.y) > 350) await moveTo(page, tx + rand(8, 16) * Math.sign(tx - pos.x || 1), ty + rand(3, 8));
    await moveTo(page, tx, ty);
    await pause(rand(120, 220));
  } catch { console.warn('  (could not find an element to point at; GitHub\'s page may have changed)'); }
}
async function type(page, text) { for (const ch of text) { await page.keyboard.type(ch); await pause(ch === ' ' ? rand(40, 90) : rand(22, 62)); } }
async function slowScroll(page, px) { for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, px / 8); await pause(35); } }
// everything is loaded and painted before a clip starts, so no recording shows a page loading
async function load(page, url) {
  await page.goto(url);
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await pause(500);
  pos.x = SIZE.width * 0.6; pos.y = SIZE.height * 0.45;
  await page.mouse.move(pos.x, pos.y);
}
// click a link, hide the page load from the recording, and carry on once the new page has settled
async function clickThrough(page, cap, locator) {
  await glide(page, locator);
  const before = page.url();
  await locator.click().catch(() => {});
  await cap.pause();
  await page.waitForURL((u) => u.href !== before, { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await pause(500);
  await cap.resume();
}
const first = (page, ...selectors) => page.locator(selectors.join(', ')).first();

// record the page with Chrome's screencast, then encode the frames with ffmpeg. pause()/resume() leave out stretches
// (such as a page navigation) so they never appear in the clip.
async function capture(ctx, page, dir) {
  const cdp = await ctx.newCDPSession(page);
  const frames = [], breaks = new Set();
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const start = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 });
  await start();
  return {
    async pause() { await cdp.send('Page.stopScreencast').catch(() => {}); breaks.add(frames.length); },
    async resume() { await start(); },
    async stop(out) {
      await pause(400);
      await cdp.send('Page.stopScreencast').catch(() => {});
      if (frames.length < 2) throw new Error('no frames captured');
      // a frame is held until the next one arrives, but never for long, so a quiet moment can't stall the clip
      const hold = (i) => (breaks.has(i + 1) || !frames[i + 1] ? 0.5 : Math.min(1.0, Math.max(0.04, frames[i + 1].t - frames[i].t)));
      const list = frames.map((f, i) => `file '${f.file}'\nduration ${hold(i).toFixed(3)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
      fs.writeFileSync(path.join(dir, 'frames.txt'), list);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'frames.txt'),
        '-vf', `fps=25,scale=${SIZE.width}:-2,format=yuv420p`, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-an', out]);
    },
  };
}

// ── the six stages ───────────────────────────────────────────────────────────────────────────────
// prepare(page): load the page first (not recorded).  run(page, cap): the action, recorded, with short pauses.
const STEPS = {
  1: { name: 'issue',
    prepare: (page) => load(page, `https://github.com/${cfg.repo}`),
    run: async (page, cap) => {
      // from the repo's home page to its Issues tab, then into one issue; each page load is cut out of the clip
      await clickThrough(page, cap, first(page, '#issues-tab', 'a[href$="/issues"]:has-text("Issues")'));
      await slowScroll(page, 120);
      await clickThrough(page, cap, first(page, cfg.issue ? `a[href$="/issues/${cfg.issue}"]` : 'a[href*="/issues/"][data-hovercard-type="issue"]', 'a[data-hovercard-type="issue"]'));
      await slowScroll(page, 320);
      if (authed) {
        const box = first(page, 'textarea[name="comment[body]"]', '#new_comment_field', 'textarea');
        await glide(page, box);
        await box.click();
        await type(page, "Hi! I'd like to work on this. My plan is a dark theme that follows the system setting. Happy to share a draft first.");
      }
      await pause(900);
    } },
  2: { name: 'fork',
    prepare: (page) => load(page, `https://github.com/${cfg.repo}`),
    run: async (page, cap) => {
      // find the Fork button on the repo page, open it, then point at Create fork
      const fork = first(page, 'a[href$="/fork"]', 'button:has-text("Fork")');
      if (authed) {
        await clickThrough(page, cap, fork);
        await glide(page, first(page, 'input[name="repository[name]"], input[value="' + cfg.repo.split('/')[1] + '"]'));
        await glide(page, first(page, 'button:has-text("Create fork")'));
      } else {
        await glide(page, fork);
      }
      await pause(900);
    } },
  3: { name: 'clone',
    prepare: (page) => load(page, `https://github.com/${cfg.fork}`),
    run: async (page) => {
      const code = first(page, 'button:has-text("Code")', 'summary:has-text("Code")');
      await glide(page, code);
      await code.click();
      await pause(600);
      // copy the URL with the copy button
      const copy = first(page, 'button[class*="CopyToClipboardIconButton"]', 'button[aria-label*="Copy url" i]', 'button[aria-label*="Copy" i]', 'clipboard-copy');
      await glide(page, copy);
      await copy.click().catch(() => {});
      await pause(1400);
    } },
  4: { name: 'change',
    prepare: (page) => load(page, authed ? `https://github.com/${cfg.fork}/edit/${cfg.branch}/${cfg.file}` : `https://github.com/${cfg.fork}/blob/${cfg.branch}/${cfg.file}`),
    run: async (page) => {
      if (authed) {
        const editor = first(page, '.cm-content', '[role="textbox"]', 'textarea');
        await glide(page, editor);
        await editor.click();
        await page.keyboard.press('Meta+ArrowDown').catch(() => {});
        await type(page, '\n\nA clearer, friendlier README.');
      } else {
        await glide(page, first(page, '[aria-label*="Edit"]', 'a[href*="/edit/"]', 'button:has(.octicon-pencil)'));
      }
      await pause(900);
    } },
  5: { name: 'open-pr',
    prepare: (page) => load(page, `https://github.com/${cfg.fork}/tree/${cfg.branch}`),
    run: async (page) => {
      // the "1 commit ahead" banner, then the Contribute menu (forks) or the compare link (same-repo branches)
      await slowScroll(page, 80);
      const contribute = first(page, 'button:has-text("Contribute")', 'summary:has-text("Contribute")');
      if (await contribute.count()) {
        await glide(page, contribute);
        await contribute.click().catch(() => {});
        await pause(450);
        await glide(page, first(page, 'a:has-text("Open pull request"), button:has-text("Open pull request")'));
      } else {
        await glide(page, first(page, 'a:has-text("ahead")', ':text-matches("commit.* ahead")'));
      }
      await pause(700);
    } },
  // step 6's clip is step 5's "commit ahead" moment followed by the pull request form; the page change in between is cut out
  6: { name: 'pr-form',
    prepare: (page) => STEPS[5].prepare(page),
    run: async (page, cap) => {
      await STEPS[5].run(page);
      await cap.pause();
      const [forkOwner] = cfg.fork.split('/');
      await load(page, `https://github.com/${cfg.repo}/compare/main...${forkOwner}:${cfg.branch}?expand=1`);
      await cap.resume();
      if (authed) {
        const title = first(page, 'input[name="pull_request[title]"]', '#pull_request_title');
        await glide(page, title);
        await title.click();
        await page.keyboard.press('Meta+A').catch(() => {});
        await type(page, 'Make the README clearer');
        const body = first(page, 'textarea[name="pull_request[body]"]', '#pull_request_body');
        await glide(page, body);
        await body.click();
        await type(page, `Clears up the intro.${cfg.issue ? `\n\nCloses #${cfg.issue}` : ''}`);
        await page.keyboard.press('Escape').catch(() => {});
        // assign the PR to yourself, then pretend to create it (the dry-run guard drops the request)
        const me = page.getByRole('button', { name: /assign yourself/i }).or(page.getByText('assign yourself', { exact: false })).first();
        await glide(page, me);
        await me.click().catch(() => {});
        await pause(500);
        const create = page.getByRole('button', { name: /^Create pull request/ }).first();
        await glide(page, create);
        await pause(300);
        await create.click().catch(() => {});
        await pause(700);
      }
      await pause(900);
    } },
};

// ── record ───────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
if (authed) {
  const ctx = await browser.newContext({ storageState: AUTH });
  const page = await ctx.newPage();
  await page.goto('https://github.com/');
  const who = await signedInAs(page).catch(() => '');
  await ctx.close();
  if (!who && !flag('allow-signed-out')) { await browser.close(); console.error('The saved sign-in has expired. Run  node tools/record-steps.mjs --login  again.'); process.exit(1); }
  console.log(`Signed in as ${who}.`);
}
for (const n of only) {
  const step = STEPS[n];
  if (!step) { console.warn(`No step ${n}`); continue; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-'));
  const ctx = await browser.newContext({ viewport: SIZE, colorScheme: flag('light') ? 'light' : 'dark', ...(authed ? { storageState: AUTH } : {}) });
  // dry run: let nothing through but reads
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort()));
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const file = path.join(OUT, `step-${String(n).padStart(2, '0')}-${step.name}.mp4`);
  try {
    await step.prepare(page); // load everything first; nothing is recorded yet
    const cap = await capture(ctx, page, tmp);
    try {
      await step.run(page, cap);
    } catch (e) {
      console.warn(`! step ${n} (${step.name}) did not finish cleanly: ${e.message.split('\n')[0]}`);
    }
    await cap.stop(file);
    console.log(`✓ step ${n}: ${path.relative(root, file)}`);
  } catch (e) {
    console.warn(`! step ${n}: ${e.message.split('\n')[0]}`);
  }
  await page.close();
  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
await browser.close();
