/* Deck wiring: reveal.js setup, step-driven slides, decorations, scene lifecycle. */
(function () {
  const params = new URLSearchParams(location.search);
  const EXPORT = params.has('export');
  if (EXPORT) {
    document.documentElement.classList.add('export');
    document.querySelectorAll('section[data-export="skip"]').forEach((s) => s.remove());
  }

  const ACCENTS = ['var(--sky)', 'var(--ochre)', 'var(--pink)', 'var(--orange)'];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Section dividers: a field of brand squares, densest in the bottom-right corner
  document.querySelectorAll('.pixels').forEach((box) => {
    const rand = rng(Number(box.dataset.seed || 1));
    const size = 76, cols = Math.ceil(1920 / size), rows = Math.ceil(1080 / size);
    let html = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // dense along the bottom, a little up the right edge, clear behind the heading
        const fy = Math.max(0, (y / rows - 0.5) / 0.5), fx = Math.max(0, (x / cols - 0.78) / 0.22);
        if (rand() > Math.min(0.9, Math.pow(fy, 1.4) * 0.9 + fx * 0.45)) continue;
        const accent = rand() < 0.22;
        const c = accent ? ACCENTS[Math.floor(rand() * 4)] : (rand() < 0.5 ? 'var(--forest)' : 'var(--deeper)');
        const o = accent ? 0.55 + rand() * 0.4 : 0.5 + rand() * 0.5;
        html += `<i class="${accent ? 'tw' : ''}" style="left:${x * size}px;top:${y * size}px;--c:${c};--o:${o.toFixed(2)};--d:${(rand() * 3).toFixed(2)}s"></i>`;
      }
    }
    box.innerHTML = html;
  });

  // Typewriter headings know their own length
  document.querySelectorAll('.type').forEach((el) => el.style.setProperty('--n', el.textContent.length));

  // Sticker book tiles
  const STICKERS = ['Sign in', 'Add address', '1 stream', '3 streams', '5 streams', 'Launch stream', 'Connect DEV', 'Launch weekend', 'DEV week 1', 'DEV week 2', 'DEV week 3', 'DEV week 4', 'GHW signup', 'GHW stream', 'GHW 10 pts', 'GHW 20 pts', 'GHW 30 pts', 'DevRelay', 'MLH Discord', 'Digital­Ocean', 'Pre-survey', 'Post-survey', 'Attend a Fest', 'Host a Fest'];
  const STICKER_COLORS = ['var(--ochre)', 'var(--sky)', 'var(--pink)', 'var(--paper)'];
  document.querySelectorAll('.sticker-book').forEach((book) => {
    book.innerHTML = STICKERS.map((name, i) =>
      `<div class="stk" style="--c:${STICKER_COLORS[i % 4]}"><b class="back">${i + 1}</b><b class="front">${name}</b></div>`).join('');
  });
  const STICKER_GOALS = [0, 3, 10, 15];

  // Fest stats from the API snapshot
  if (window.FESTS) {
    document.querySelectorAll('[data-fest-total]').forEach((el) => (el.textContent = window.FESTS.total));
    document.querySelectorAll('[data-fest-countries]').forEach((el) => (el.textContent = window.FESTS.countries));
    document.querySelectorAll('[data-fest-asof]').forEach((el) => (el.textContent = `MLH events API, ${window.FESTS.asOf}`));
  }

  // Carousel cards are placed around a ring
  document.querySelectorAll('.ring-card').forEach((card, i) => card.style.setProperty('--i', i));

  /* Step slides: invisible `.fragment.step` markers drive `[data-at]` / `[data-from]` children. */
  function applySteps(slide) {
    if (!slide || !slide.hasAttribute('data-steps')) return;
    const step = slide.querySelectorAll('.fragment.step.visible').length;
    slide.style.setProperty('--step', step);
    slide.querySelectorAll('[data-at]').forEach((el) => {
      const at = Number(el.dataset.at);
      el.classList.toggle('active', at === step);
      el.classList.toggle('past', at < step);
    });
    slide.querySelectorAll('[data-from]').forEach((el) => el.classList.toggle('shown', step >= Number(el.dataset.from)));
    slide.querySelectorAll('.ring').forEach((ring) => ring.style.setProperty('--step', step));
    slide.querySelectorAll('.ring-card').forEach((c, i) => c.classList.toggle('active', i === step));
    slide.querySelectorAll('.sticker-book').forEach((book) => {
      const goal = STICKER_GOALS[Math.min(step, STICKER_GOALS.length - 1)];
      [...book.children].forEach((t, i) => {
        t.style.setProperty('--delay', `${Math.max(0, i - (STICKER_GOALS[step - 1] || 0)) * 0.06}s`);
        t.classList.toggle('on', i < goal);
      });
    });
  }

  // Count-up numbers
  function countUp(slide) {
    slide.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      if (EXPORT) { el.textContent = target; return; }
      const start = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - start) / 1200);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function onSlide(slide) {
    applySteps(slide);
    countUp(slide);
    Scenes.show(slide);
    document.querySelector('.reveal').classList.toggle('light-current', slide.classList.contains('light') || slide.classList.contains('statement'));
  }

  Reveal.initialize({
    width: 1920,
    height: 1080,
    margin: 0,
    minScale: 0.1,
    maxScale: 4,
    center: false,
    hash: true,
    controls: !EXPORT,
    controlsTutorial: false,
    progress: !EXPORT,
    slideNumber: EXPORT ? false : 'c/t',
    transition: EXPORT ? 'none' : 'fade',
    backgroundTransition: EXPORT ? 'none' : 'fade',
    transitionSpeed: 'fast',
    plugins: [RevealNotes],
  }).then(() => {
    onSlide(Reveal.getCurrentSlide());
    Reveal.on('slidechanged', (e) => onSlide(e.currentSlide));
    Reveal.on('fragmentshown', () => applySteps(Reveal.getCurrentSlide()));
    Reveal.on('fragmenthidden', () => applySteps(Reveal.getCurrentSlide()));
    window.__deckReady = true;
  });
})();
