/* The xkcd 2347 tower with real 2D physics (Matter.js).
   Every block is cut out of the original comic using its traced outline (js/tower-data.js), so each one looks
   exactly like the drawing. Everything is frozen until Tower.collapse() (next click, or click the tower);
   then the tiny support block is kicked out and gravity does the rest. */
(function () {
  const svg = document.getElementById('tower');
  if (!svg || !window.Matter || !window.TOWER_BLOCKS) return;
  const { Engine, Bodies, Body, Composite } = Matter;
  const NS = 'http://www.w3.org/2000/svg';
  const SRC = 'assets/img/xkcd-dependency.png';
  const PAD = 1.5; // physics bodies stand a hair outside the fill so touching blocks rest on each other's outlines

  let engine, items, post, raf, started;

  function build() {
    cancelAnimationFrame(raf);
    started = false;
    svg.querySelectorAll('.blk, .fallback, .blk-defs').forEach((n) => n.remove());
    engine = Engine.create({ enableSleeping: false });
    engine.gravity.y = 1.5;
    items = [];

    const defs = document.createElementNS(NS, 'defs');
    defs.setAttribute('class', 'blk-defs');
    svg.insertBefore(defs, svg.firstChild);
    const layer = document.createElementNS(NS, 'g');
    layer.setAttribute('class', 'blk');
    svg.appendChild(layer);
    // the comic's own lettering stays readable on top of any rubble
    svg.appendChild(document.getElementById('xk-label'));

    const bases = TOWER_BLOCKS.filter((b) => b.k === 'base');
    const rest = TOWER_BLOCKS.filter((b) => b.k !== 'base');
    [...bases, ...rest].forEach((blk, i) => {
      const [x1, y1, x2, y2] = blk.b;
      const w = x2 - x1 + 1, h = y2 - y1 + 1;
      const cx = x1 + w / 2, cy = y1 + h / 2;
      const body = Bodies.rectangle(cx, cy, w + 2 * PAD, h + 2 * PAD, {
        isStatic: true, friction: 0.9, frictionStatic: 1.2, restitution: 0.04, density: 0.002,
      });
      Composite.add(engine.world, body);

      const clip = document.createElementNS(NS, 'clipPath');
      clip.setAttribute('id', `blk-${i}`);
      const cp = document.createElementNS(NS, 'path');
      cp.setAttribute('d', blk.d);
      cp.setAttribute('clip-rule', 'evenodd');
      clip.appendChild(cp);
      defs.appendChild(clip);

      const g = document.createElementNS(NS, 'g');
      const inner = document.createElementNS(NS, 'g');
      inner.setAttribute('transform', `translate(${-cx} ${-cy})`);
      const im = document.createElementNS(NS, 'image');
      im.setAttribute('href', SRC);
      im.setAttribute('width', 770);
      im.setAttribute('height', 978);
      im.setAttribute('clip-path', `url(#blk-${i})`);
      inner.appendChild(im);
      g.appendChild(inner);
      layer.appendChild(g);
      items.push({ body, g, base: blk.k === 'base' });
      if (blk.k === 'post') post = body;
    });

    // the room: a floor and two walls so nothing leaves the picture
    Composite.add(engine.world, [
      Bodies.rectangle(385, 960, 2000, 40, { isStatic: true, friction: 1 }),
      Bodies.rectangle(-20, 500, 40, 2000, { isStatic: true }),
      Bodies.rectangle(790, 500, 40, 2000, { isStatic: true }),
    ]);
    render();
  }

  function render() {
    items.forEach(({ body, g }) => {
      g.setAttribute('transform', `translate(${body.position.x.toFixed(2)} ${body.position.y.toFixed(2)}) rotate(${(body.angle * 180 / Math.PI).toFixed(2)})`);
    });
  }

  function collapse() {
    if (started) return;
    started = true;
    items.forEach((it) => { if (!it.base) Body.setStatic(it.body, false); });
    // kick out the one small block holding everything up
    Body.setVelocity(post, { x: 9, y: -2 });
    Body.setAngularVelocity(post, 0.2);
    const t0 = performance.now();
    let last = t0;
    const step = (t) => {
      Engine.update(engine, Math.min(24, t - last));
      last = t;
      render();
      if (t - t0 < 7000) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  svg.addEventListener('click', collapse);
  window.Tower = { reset: build, collapse };
  build();
})();
