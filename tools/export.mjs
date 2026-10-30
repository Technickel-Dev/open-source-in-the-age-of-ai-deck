// Exports the HTML deck to dist/Hacktoberfest-2026.pptx (+ .pdf) with the animations baked in.
//
//   <section data-export="video" data-export-seconds="8">  → recorded frame-by-frame into an MP4 that plays in PowerPoint
//   <section data-export="steps">                          → one slide per click state (carousel, stepper, …)
//   <section data-export="skip">                           → left out
//   anything else                                          → one slide, all fragments shown
//
// Speaker notes come from <aside class="notes">, and links stay clickable.
// Needs Edge or Chrome (BROWSER=chrome to switch) and ffmpeg on PATH.
//   npm run export            → pptx + pdf
//   npm run export -- --fast  → skip video recording (stills only)
import { chromium } from 'playwright-core';
import PptxGenJS from 'pptxgenjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const work = path.join(dist, 'frames');
const FPS = 30;
const FAST = process.argv.includes('--fast');
const SETTLE_MS = 1800; // let CSS entrance animations finish before a still

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.BROWSER || 'msedge',
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?export');
await page.waitForFunction(() => window.__deckReady === true);
await page.evaluate(() => document.fonts.ready);

const slides = await page.evaluate(() =>
  Reveal.getSlides().map((s) => {
    const idx = [...new Set([...s.querySelectorAll('.fragment')].map((f) => Number(f.dataset.fragmentIndex)))];
    return {
      id: s.id,
      mode: s.dataset.export || 'still',
      seconds: Number(s.dataset.exportSeconds || 6),
      lastFragment: idx.length ? Math.max(...idx) : -1,
      notes: (s.querySelector('aside.notes')?.innerText || '').trim(),
    };
  })
);

async function goTo(h, f) {
  await page.evaluate(([h, f]) => Reveal.slide(h, 0, f), [h, f]);
  await page.waitForTimeout(SETTLE_MS);
}

// Clickable areas, in slide pixels (viewport is 1:1 with the 1920×1080 canvas)
const links = () =>
  page.evaluate(() =>
    [...Reveal.getCurrentSlide().querySelectorAll('a[href]')]
      .filter((a) => getComputedStyle(a).opacity !== '0' && a.offsetParent)
      .map((a) => { const r = a.getBoundingClientRect(); return { url: a.href, x: r.x, y: r.y, w: r.width, h: r.height }; })
      .filter((l) => l.w > 0 && l.h > 0 && l.x >= 0 && l.y >= 0)
  );

const out = []; // { png, video?, notes, links }
for (let h = 0; h < slides.length; h++) {
  const s = slides[h];
  const tag = String(h + 1).padStart(2, '0');
  const states = s.mode === 'steps' ? [...Array(s.lastFragment + 2).keys()].map((i) => i - 1) : [s.lastFragment];

  for (const f of states) {
    await goTo(h, f);
    const png = path.join(work, `${tag}-${s.id || 'slide'}${states.length > 1 ? `-${f + 1}` : ''}.png`);
    await page.screenshot({ path: png });
    const item = { png, notes: s.notes, links: await links() };

    if (s.mode === 'video' && !FAST) {
      const dir = path.join(work, `${tag}-video`);
      fs.mkdirSync(dir);
      const frames = Math.round(s.seconds * FPS);
      process.stdout.write(`  recording ${s.id} (${frames} frames)`);
      for (let i = 0; i < frames; i++) {
        await page.evaluate((t) => Scenes.renderAt(t), i / FPS);
        await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
        if (i % 30 === 0) process.stdout.write('.');
      }
      process.stdout.write('\n');
      item.video = path.join(work, `${tag}-${s.id}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', item.video]);
      // poster = first frame, so the slide looks right before playback starts
      fs.copyFileSync(path.join(dir, '0000.jpg'), png.replace(/\.png$/, '-poster.jpg'));
      item.poster = png.replace(/\.png$/, '-poster.jpg');
      await page.evaluate(() => Scenes.renderAt(null));
    }
    out.push(item);
    console.log(`✓ ${path.basename(png)}${item.video ? ' + mp4' : ''}`);
  }
}

// ── PPTX ──────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in
pptx.title = 'Hacktoberfest 2026';
pptx.author = 'Bradley Leonard / Technickel';
const IN = 13.333 / 1920;
const CLEAR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==';

for (const item of out) {
  const slide = pptx.addSlide();
  if (item.video) {
    slide.background = { path: item.poster };
    const cover = 'data:image/jpeg;base64,' + fs.readFileSync(item.poster).toString('base64');
    slide.addMedia({ type: 'video', path: item.video, cover, x: 0, y: 0, w: 13.333, h: 7.5 });
  } else {
    slide.background = { path: item.png };
  }
  for (const l of item.links) {
    slide.addImage({ data: CLEAR_PNG, x: l.x * IN, y: l.y * IN, w: l.w * IN, h: l.h * IN, hyperlink: { url: l.url, tooltip: l.url } });
  }
  if (item.notes) slide.addNotes(item.notes);
}
const pptxPath = path.join(dist, 'Hacktoberfest-2026.pptx');
await pptx.writeFile({ fileName: pptxPath });
console.log(`\n→ ${pptxPath}`);

// ── PDF (stills) ──────────────────────────────────
const pdfPage = await browser.newPage();
const imgs = out.map((o) => `<img src="${pathToFileURL(o.png).href}">`).join('');
const htmlPath = path.join(work, 'pdf.html');
fs.writeFileSync(htmlPath, `<!doctype html><style>@page{size:1920px 1080px;margin:0}body{margin:0}img{display:block;width:1920px;height:1080px;break-after:page}</style>${imgs}`);
await pdfPage.goto(pathToFileURL(htmlPath).href);
await pdfPage.waitForLoadState('load');
const pdfPath = path.join(dist, 'Hacktoberfest-2026.pdf');
await pdfPage.pdf({ path: pdfPath, width: '1920px', height: '1080px', printBackground: true });
console.log(`→ ${pdfPath}`);

await browser.close();
