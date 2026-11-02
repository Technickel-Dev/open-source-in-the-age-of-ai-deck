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

  // Two versions of 2026: "myth" lights only October, "real" lights every month
  const COBWEB = '<svg class="web" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M0 0L100 0M0 0L90 40M0 0L65 65M0 0L40 90M0 0L0 100"/><path d="M30 0Q26 26 0 30M55 0Q48 48 0 55M80 0Q70 70 0 80"/></g></svg>';
  const SPIDER = '<svg class="spider" viewBox="0 0 20 20" aria-hidden="true"><g stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M7 8L2 4M7 10L1 10M7 12L2 17M8 14L5 19M13 8L18 4M13 10L19 10M13 12L18 17M12 14L15 19"/></g><circle cx="10" cy="11" r="3.6" fill="currentColor"/><circle cx="10" cy="7.6" r="2.2" fill="currentColor"/></svg>';
  document.querySelectorAll('.year').forEach((year) => {
    const year_ = 2026;
    let out = '';
    for (let m = 0; m < 12; m++) {
      const rand = rng(m * 97 + 11);
      const lead = new Date(year_, m, 1).getDay(), days = new Date(year_, m + 1, 0).getDate();
      const name = new Date(year_, m, 1).toLocaleString('en-US', { month: 'short' });
      let cells = '<b class="gap"></b>'.repeat(lead);
      for (let d = 1; d <= days; d++) { const o = 0.35 + rand() * 0.65; let lvl = rand() < 0.14 ? 0 : 1 + Math.floor(rand() * 4); if ((m === 11 && d >= 20) || (m === 0 && d <= 4)) lvl = o > 0.93 ? 2 : o > 0.72 ? 1 : 0; else if ((m === 11 && d >= 16) || (m === 0 && d <= 7)) lvl = Math.min(lvl, 2); cells += `<b data-l="${lvl}" style="--o:${o.toFixed(2)}"></b>`; }
      const hot = m === 9 && year.dataset.mode === 'myth';
      out += `<div class="cal-month${hot ? ' oct' : ''}"><p class="mono cal-name">${name}${hot ? ' <i>Hacktoberfest</i>' : ''}</p><div class="cal-days">${cells}</div>${hot ? COBWEB + SPIDER : ''}</div>`;
    }
    year.innerHTML = out;
  });

  // Camcorder timecode on the record slide
  const tc = document.querySelector('[data-timecode]');
  if (tc) {
    const t0 = Date.now();
    setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      tc.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
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
  }

  // Count-up numbers
  function countUp(slide) {
    slide.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count), suffix = el.dataset.suffix || '';
      if (EXPORT) { el.textContent = target + suffix; return; }
      const start = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - start) / 1200);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
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

  // Everything except click-through (`data-steps`) slides reveals its fragments on its own.
  let autoTimer = null;
  function autoReveal(slide) {
    clearTimeout(autoTimer);
    if (EXPORT || !slide || slide.hasAttribute('data-steps')) return;
    const next = () => {
      // fragments marked .collapse wait for the presenter's own click
      const upcoming = slide.querySelector('.fragment:not(.visible)');
      if (Reveal.getCurrentSlide() !== slide || (upcoming && upcoming.classList.contains('collapse')) || !Reveal.nextFragment()) return;
      autoTimer = setTimeout(next, 500);
    };
    autoTimer = setTimeout(next, 600);
  }

  // Footer text sits on the slide-number line (outside the scaled slide) instead of inside each slide
  let globalFoot = null;
  if (!EXPORT) {
    document.documentElement.classList.add('global-foot');
    globalFoot = document.createElement('div');
    globalFoot.className = 'deck-foot';
    document.querySelector('.reveal').appendChild(globalFoot);
  }
  function placeFoot(slide) {
    if (!globalFoot) return;
    const src = slide && slide.querySelector('.foot span');
    globalFoot.textContent = src ? src.textContent : '';
    globalFoot.style.display = src ? '' : 'none';
    const num = document.querySelector('.reveal .slide-number');
    if (num) {
      const r = num.getBoundingClientRect();
      globalFoot.style.left = `${Math.round(r.right + 16)}px`;
      // centre the text on the slide number's own line
      globalFoot.style.top = `${Math.round((r.top + r.bottom) / 2 - globalFoot.offsetHeight / 2)}px`;
    }
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
    placeFoot(Reveal.getCurrentSlide());
    window.addEventListener('resize', () => placeFoot(Reveal.getCurrentSlide()));
    autoReveal(Reveal.getCurrentSlide());
    Reveal.on('slidechanged', (e) => {
      // Slides marked data-reset replay from the top each time they're entered
      const prev = e.previousSlide;
      if (prev && prev.hasAttribute('data-reset')) prev.querySelectorAll('.fragment').forEach((f) => f.classList.remove('visible', 'current-fragment'));
      if (prev && prev.id === 'now' && window.Tower) Tower.reset();
      onSlide(e.currentSlide); placeFoot(e.currentSlide); autoReveal(e.currentSlide);
    });
    Reveal.on('fragmentshown', () => applySteps(Reveal.getCurrentSlide()));
    // The xkcd tower: the presenter's next click kicks out the small block; stepping back puts it back
    Reveal.on('fragmentshown', (e) => { if (!EXPORT && window.Tower && e.fragment.classList.contains('collapse')) Tower.collapse(); });
    Reveal.on('fragmenthidden', (e) => { if (window.Tower && e.fragment.classList.contains('collapse')) Tower.reset(); });
    Reveal.on('fragmenthidden', () => applySteps(Reveal.getCurrentSlide()));
    // Going back is one action: straight to the previous slide with everything already shown (no stepping back
    // through fragments, and no fight with the auto-reveal). Going forward still plays each slide's reveals.
    const goBack = () => {
      clearTimeout(autoTimer);
      const i = Reveal.getIndices();
      if (i.h > 0) Reveal.slide(i.h - 1, 0, -1);
    };
    ['navigateLeft', 'navigateUp', 'navigatePrev', 'prev'].forEach((fn) => { Reveal[fn] = goBack; });
    // Reveal's own keyboard and arrow-button handling steps back through fragments, so catch "back" first
    const BACK_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'h', 'k', 'p']);
    window.addEventListener('keydown', (e) => {
      if (Reveal.isOverview() || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName)) return;
      if (BACK_KEYS.has(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); goBack(); }
    }, true);
    document.querySelector('.reveal').addEventListener('click', (e) => {
      if (e.target.closest('.navigate-left, .navigate-up')) { e.preventDefault(); e.stopImmediatePropagation(); goBack(); }
    }, true);
    window.__deckReady = true;
  });
})();
