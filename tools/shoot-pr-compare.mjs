// Screenshots two real (never submitted) GitHub "Open a pull request" forms for the proof slide: one with a bare description,
// one with a structured description and an image. Dry run: only GETs and the Markdown preview request are let through.
//
//   node tools/shoot-pr-compare.mjs --fork Technickel-Dev/low-poly --branch demo-clearer-readme [--repo owner/repo]
//
// Needs the saved sign-in from  node tools/record-steps.mjs --login  and a pushed branch to compare against main; with-proof also needs public/demo/before.png and after.png on that branch.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const repo = opt('repo', 'Technickel-Dev/low-poly');
const fork = opt('fork', repo);
const branch = opt('branch', 'main');
const [forkOwner] = fork.split('/');
const RAW = `https://raw.githubusercontent.com/${repo}/${branch}/public/demo`; // before.png / after.png, committed to the temp branch

const PRS = [
  { file: 'pr-without-proof.png', title: 'Dark mode', body: 'Added dark mode.', preview: false },
  { file: 'pr-with-proof.png', title: 'Add dark mode that follows the system setting', preview: true,
    body: `Adds a dark theme that follows the system setting. Closes #29.\n\n**How I tested:** switched macOS between light and dark, and checked contrast on every form field.\n\n| Before | After |\n| --- | --- |\n| ![Before](${RAW}/before.png) | ![After](${RAW}/after.png) |` },
];

const browser = await chromium.launch({ channel: process.env.BROWSER || 'chrome' });
for (const pr of PRS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', storageState: path.join(root, '.auth', 'github.json') });
  await ctx.route('**/*', (r) => {
    const q = r.request();
    return ['GET', 'HEAD', 'OPTIONS'].includes(q.method()) || /\/preview/.test(q.url()) ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`https://github.com/${repo}/compare/main...${forkOwner}:${branch}?expand=1`);
  await page.waitForLoadState('load');
  await page.locator('input[name="pull_request[title]"], #pull_request_title').first().fill(pr.title);
  await page.locator('textarea[name="pull_request[body]"], #pull_request_body').first().fill(pr.body);
  if (pr.preview) {
    await page.getByRole('tab', { name: /preview/i }).first().click().catch(() => page.locator('button:has-text("Preview")').first().click());
    await page.waitForSelector('.comment-body img', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(2500);
  const form = page.locator('form#new_pull_request, form.js-new-pull-request, form[action$="/pull/create"]').first();
  const box = await form.boundingBox().catch(() => null);
  // a little margin around the form so nothing looks cut off; both shots share one size
  const m = 28;
  await page.screenshot({ path: path.join(root, 'assets', 'img', pr.file), clip: box ? { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: box.width + 2 * m, height: 660 } : undefined });
  console.log('✓', pr.file);
  await ctx.close();
}
await browser.close();
