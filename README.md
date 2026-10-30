# Open Source in the age of AI

HTML/JS slides (reveal.js + three.js) on contributing to Open Source in the age of AI. Hacktoberfest is the origin story, covered in two slides. Includes an exporter that bakes the animations into a normal PowerPoint.

## Present

Open `index.html` in a browser (double-click works, it needs internet for the CDN scripts and fonts).
Or serve it: `npm run serve`, then http://localhost:5173 (uses `python3`).

| Key | Does |
|---|---|
| → / Space | next slide or click step |
| S | speaker view with notes |
| F | fullscreen |
| Esc | slide overview |

## Edit

- **Slides** are `<section>`s in `index.html`, one per slide, in order. Speaker notes go in `<aside class="notes">`.
- **Look** is `css/theme.css` (brand colors and fonts are at the top).
- **3D scenes** are in `js/scenes.js`: `pixelfield` (cover/closing). Put `<canvas class="scene" data-scene="…">` in any slide to use one. Scenes only run while their slide is showing.
- **Click-through slides** (six steps, carousel) use `data-steps` plus invisible `<span class="fragment step">` markers. Each click shows the next `[data-at="n"]` element.
- Placeholders to fill are in `[square brackets]`.

## Share as normal slides

```bash
npm install
npm run export          # → dist/Open-Source-in-the-Age-of-AI.pptx + .pdf (~3 min)
npm run export -- --fast  # stills only, no video recording
```

Control each slide's export with `data-export` on its `<section>`:

| Value | Export |
|---|---|
| *(none)* | one still, all fragments shown |
| `video` | MP4 recorded frame by frame (`data-export-seconds`), plays in PowerPoint |
| `steps` | one PowerPoint slide per click state |
| `skip` | left out (e.g. the "remember to record" slide) |

Needs Edge or Chrome (`BROWSER=chrome npm run export` to switch) and `ffmpeg` on PATH. Exported slides are images, so edit text in the HTML and re-export. Links stay clickable and speaker notes carry over.
