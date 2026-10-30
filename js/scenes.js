/* three.js scenes. Each factory returns { start(), stop(), render(t) }.
   Scenes render at a fixed 1920×1080 so live view and exports match. */
(function () {
  const W = 1920, H = 1080;
  const BRAND = {
    forest: 0x3d5f58, deep: 0x2e4742, deeper: 0x22352f, paper: 0xf2f2eb,
    sky: 0x8bb2de, ochre: 0xf5b726, pink: 0xe97b77, orange: 0xe53927,
  };

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function renderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.setSize(W, H, false);
    return r;
  }

  const mouse = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  /* ── Pixel field: the site's hero squares, extruded and rippling ── */
  function pixelField(canvas, opts) {
    const seed = Number(opts.seed || 1);
    const end = opts.variant === 'end';
    const cols = 46, rows = 28;
    let r, scene, camera, mesh, cells;
    const dummy = new THREE.Object3D();

    function init() {
      const rand = rng(seed);
      r = renderer(canvas);
      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(BRAND.deep, 28, 62);
      camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);
      scene.add(new THREE.HemisphereLight(BRAND.paper, 0x16231f, 1.15));
      const sun = new THREE.DirectionalLight(0xffffff, 1.7);
      sun.position.set(-14, 26, 12);
      scene.add(sun);

      const base = [0x3d5f58, 0x2e4742, 0x35524c, 0x476b63, 0x2a403b];
      const accents = [BRAND.sky, BRAND.ochre, BRAND.pink, BRAND.orange];
      const geo = new THREE.BoxGeometry(0.9, 1, 0.9);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
      mesh = new THREE.InstancedMesh(geo, mat, cols * rows);
      cells = [];
      const c = new THREE.Color();
      let i = 0;
      for (let z = 0; z < rows; z++) {
        for (let x = 0; x < cols; x++) {
          const accent = rand() < (end ? 0.07 : 0.045);
          c.setHex(accent ? accents[Math.floor(rand() * accents.length)] : base[Math.floor(rand() * base.length)]);
          mesh.setColorAt(i, c);
          cells.push({ x: x - cols / 2 + 0.5, z: z - rows / 2 + 0.5, accent, phase: rand() * Math.PI * 2, amp: 0.6 + rand() * 0.9 });
          i++;
        }
      }
      scene.add(mesh);
    }

    function render(t) {
      for (let i = 0; i < cells.length; i++) {
        const k = cells[i];
        let h = 0.3 + 1.1 * (0.5 + 0.5 * Math.sin(k.x * 0.3 + t * 1.05) * Math.cos(k.z * 0.36 - t * 0.75));
        if (k.accent) h += k.amp * (1.3 + Math.sin(t * 1.8 + k.phase));
        dummy.position.set(k.x, h / 2, k.z);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      const drift = Math.sin(t * 0.15) * 2.5;
      camera.position.set(drift + mouse.x * 2.5, end ? 30 : 21 - mouse.y * 1.5, end ? 22 : 33);
      camera.lookAt(drift * 0.4, 0, end ? 0 : 3);
      r.render(scene, camera);
    }

    return { init, render, get ready() { return !!r; } };
  }

  /* ── registry + shared clock ── */
  const factories = { pixelfield: pixelField };
  const instances = new Map();
  let active = [], raf = null, manual = null;
  const t0 = performance.now();
  const now = () => (manual !== null ? manual : (performance.now() - t0) / 1000);

  function get(canvas) {
    if (!instances.has(canvas)) {
      const f = factories[canvas.dataset.scene];
      if (!f) return null;
      instances.set(canvas, f(canvas, canvas.dataset));
    }
    const s = instances.get(canvas);
    if (!s.ready) s.init();
    return s;
  }

  function loop() {
    active.forEach((s) => s.render(now()));
    raf = requestAnimationFrame(loop);
  }

  window.Scenes = {
    // run the scenes inside `slide`, pause everything else
    show(slide) {
      active = slide ? [...slide.querySelectorAll('canvas[data-scene]')].map(get).filter(Boolean) : [];
      if (active.length && !raf && manual === null) raf = requestAnimationFrame(loop);
      if (!active.length && raf) { cancelAnimationFrame(raf); raf = null; }
      active.forEach((s) => s.render(now()));
    },
    // exporter hook: freeze the clock and render one exact frame at time t (seconds); null resumes real time
    renderAt(t) {
      manual = t;
      if (t === null) { if (active.length && !raf) raf = requestAnimationFrame(loop); return; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      active.forEach((s) => s.render(t));
    },
  };
})();
