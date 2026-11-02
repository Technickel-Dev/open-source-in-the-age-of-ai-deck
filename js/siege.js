/* "AI is at the gates": a robot swarm and a colossal AI charge the walled castle of code,
   who raise the drawbridge. Every frame is a pure function of t (seconds since the slide opened). */
(function () {
  const { rng, BRAND } = Scenes.util;
  const END = 13.5;
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EXPORT = new URLSearchParams(location.search).has('export');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const easeOut = (v) => 1 - Math.pow(1 - clamp(v), 3);

  // timeline (seconds)
  const RAISE_AT = 3.5, RAISE_DUR = 1.25, RAISE_MAX = 1.38;
  // the colossal "AI": one word, one rigid block, "walked" like a fridge. Every rock plants one base corner and
  // twists the whole word about it, so the far corner swings forward in an arc: the travel comes from the rotation.
  const BOSS_T0 = 0.5, BOSS_P = 1.4, BOSS_LAST = 2.6, BOSS_STEPS = 8, BOSS_Z = -22, BOSS_X = -22, LS = 1.4; // LS: word scale
  const SLAM = 0.78; // fraction of a rock at which the raised corner thuds back down
  const LETTERS = [{ ch: 'AI', half: 12.7 }]; // the whole word is one body, 25.4 units wide
  const BOSS_A = 12.7 * LS; // half the word's width in world units
  const WALK = (() => {
    const D = 0.2, H = 1.15; // wiggle per rock, and the side-on heading it walks at
    const side = [], psi = [], c = [[0, 0]], T = [BOSS_T0], P = [];
    for (let i = 0; i <= BOSS_STEPS; i++) { side[i] = i % 2 ? -1 : 1; psi[i] = i === BOSS_STEPS ? 0 : H - side[i] * D / 2; }
    for (let i = 0; i < BOSS_STEPS; i++) {
      P[i] = i === BOSS_STEPS - 1 ? BOSS_LAST : BOSS_P; // the last rock is the long swing round to face the camera
      T[i + 1] = T[i] + P[i];
      const s = side[i], u0 = [Math.cos(psi[i]), -Math.sin(psi[i])], u1 = [Math.cos(psi[i + 1]), -Math.sin(psi[i + 1])];
      c[i + 1] = [c[i][0] + s * BOSS_A * (u0[0] - u1[0]), c[i][1] + s * BOSS_A * (u0[1] - u1[1])];
    }
    const dx = BOSS_X - c[BOSS_STEPS][0], dz = BOSS_Z - c[BOSS_STEPS][1];
    c.forEach((p) => { p[0] += dx; p[1] += dz; });
    return { side, psi, c, T, P };
  })();
  // every landing: { t, x, z } in world space, sorted by time (the raised corner is the one that comes down)
  const IMPACTS = Array.from({ length: BOSS_STEPS }, (_, i) => {
    const { side, psi, c, T, P } = WALK, s = side[i], k = psi[i + 1];
    return { t: T[i] + P[i] * SLAM, x: c[i + 1][0] - s * BOSS_A * Math.cos(k), z: c[i + 1][1] + s * BOSS_A * Math.sin(k) };
  });

  // layout
  const MOAT_L = 1.5, MOAT_R = 9, WATER_Y = -1.25, HINGE_X = 10.3, BRIDGE_LEN = 9.6, BRIDGE_Z = -1.2; // towers (x >= 9.6) stand on land; the hinge sits just in front of the gatehouse face (x = 10.6)

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function siege(canvas) {
    const stage = canvas.parentElement;
    let r, scene, camera, ready = false;
    const disposables = [];
    const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();

    const mat = (hex, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.82, metalness: 0.05, flatShading: true, ...o }); disposables.push(m); return m; };
    const geo = (g) => (disposables.push(g), g);
    function box(w, h, d, m, x, y, z, parent) {
      const b = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m);
      b.position.set(x, y, z); b.castShadow = b.receiveShadow = true;
      (parent || scene).add(b);
      return b;
    }
    function cyl(rt, rb, h, seg, m, x, y, z, parent) {
      const c = new THREE.Mesh(geo(new THREE.CylinderGeometry(rt, rb, h, seg)), m);
      c.position.set(x, y, z); c.castShadow = c.receiveShadow = true;
      (parent || scene).add(c);
      return c;
    }
    // place a unit-height Y-cylinder between a and b
    function stretch(o, a, b) {
      o.position.copy(a).add(b).multiplyScalar(0.5);
      v3.copy(b).sub(a);
      o.scale.set(1, v3.length(), 1);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3.normalize());
    }

    let ground, groundBase, bridge, chains = [], flags = [], torches = [], signOpen, signClosed;
    let swarm, leads = [], boss, dust, splash, embers;

    function init() {
      const W = stage.clientWidth || 1680, H = stage.clientHeight || 520;
      r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(W, H, false);
      r.shadowMap.enabled = true;
      r.localClippingEnabled = true; // the OPEN board is clipped at the slot it drops into
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.45;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, W / H, 0.5, 400);
      const fogCol = new THREE.Color(0x4a5e50);
      scene.fog = new THREE.Fog(fogCol, 55, 150);

      // dusk sky
      scene.background = canvasTex(8, 512, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#22352f'); grd.addColorStop(0.35, '#3D5F58'); grd.addColorStop(0.6, '#8a7d55');
        grd.addColorStop(0.78, '#d98a45'); grd.addColorStop(0.86, '#e9b25a'); grd.addColorStop(1, '#4a5e50');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      });
      disposables.push(scene.background);

      scene.add(new THREE.HemisphereLight(0xdfe6d6, 0x2a3d36, 1.5));
      const sun = new THREE.DirectionalLight(0xffc58a, 2.6); // low, warm, from behind-left: rim light
      sun.position.set(-40, 30, -45);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -60, right: 45, top: 40, bottom: -30, near: 10, far: 160 });
      sun.shadow.bias = -0.0008;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x8bb2de, 0.75);
      fill.position.set(20, 18, 40);
      scene.add(fill);

      buildLand();
      buildGrass();
      buildForest();
      buildCastle();
      buildBridge();
      buildSwarm();
      buildBoss();
      buildParticles();
      ready = true;
    }

    /* ── land: field (rippling), moat, far hills ── */
    function buildLand() {
      const g = geo(new THREE.PlaneGeometry(130, 120, 130, 70));
      g.rotateX(-Math.PI / 2);
      g.translate(MOAT_L - 65, 0, -10);
      groundBase = Float32Array.from(g.attributes.position.array);
      const rand = rng(7);
      const cols = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color();
      for (let i = 0; i < g.attributes.position.count; i++) {
        groundBase[i * 3 + 1] = (rand() - 0.5) * 0.18;
        c.setHex([0x3d5f58, 0x456a5f, 0x35524c, 0x4a6e5e][Math.floor(rand() * 4)]);
        cols.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      ground = new THREE.Mesh(g, mat(0xffffff, { vertexColors: true, roughness: 0.95 }));
      ground.receiveShadow = true;
      scene.add(ground);

      // the same grass, not rippled, filling everything past the field so the hills stand on land
      const grassCols = [0x3d5f58, 0x456a5f, 0x35524c, 0x4a6e5e];
      const grassRand = rng(11);
      const farGrass = (w, d, cx, cz, nx, nz) => {
        const fg = geo(new THREE.PlaneGeometry(w, d, nx, nz));
        fg.rotateX(-Math.PI / 2);
        const n = fg.attributes.position.count, fc = new Float32Array(n * 3), col = new THREE.Color();
        for (let i = 0; i < n; i++) { col.setHex(grassCols[Math.floor(grassRand() * 4)]); fc.set([col.r, col.g, col.b], i * 3); fg.attributes.position.array[i * 3 + 1] = (grassRand() - 0.5) * 0.18; }
        fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
        fg.computeVertexNormals();
        const m = new THREE.Mesh(fg, mat(0xffffff, { vertexColors: true, roughness: 0.95 }));
        m.position.set(cx, 0, cz);
        m.receiveShadow = true;
        scene.add(m);
      };
      farGrass(420, 100, -20, -120, 140, 34); // behind the field and the castle, out under the hills
      farGrass(100, 120, -174, -10, 34, 40); // past the field's left edge

      // castle-side ground and moat
      farGrass(220, 210, MOAT_R + 110, -45, 70, 70); // the castle's side of the moat gets the same grass, far past the castle
      const water = new THREE.Mesh(geo(new THREE.PlaneGeometry(MOAT_R - MOAT_L, 210)), mat(0x2f6f8f, { roughness: 0.15, metalness: 0.3, flatShading: false, transparent: true, opacity: 0.92, emissive: 0x0b2a3a }));
      water.rotation.x = -Math.PI / 2;
      water.position.set((MOAT_L + MOAT_R) / 2, WATER_Y, -45);
      water.receiveShadow = true;
      scene.add(water);
      const bank = mat(0x2a3f38);
      box(0.4, 2.2, 210, bank, MOAT_L - 0.2, -1.1, -45).castShadow = false;
      box(0.4, 2.2, 210, bank, MOAT_R + 0.2, -1.1, -45).castShadow = false;
      box(MOAT_R - MOAT_L, 0.3, 210, mat(0x1b2f2a), (MOAT_L + MOAT_R) / 2, -2.2, -45);

      // distant low-poly hills
      const hillMats = [mat(0x2a403b, { fog: true }), mat(0x22352f), mat(0x31504a)];
      const rh = rng(21);
      for (let i = 0; i < 14; i++) {
        const h = 8 + rh() * 14;
        const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(12 + rh() * 14, h, 6 + Math.floor(rh() * 3))), hillMats[i % 3]);
        cone.position.set(-110 + i * 17 + rh() * 8, h / 2 - 1, -70 - rh() * 30);
        cone.rotation.y = rh() * 3;
        scene.add(cone);
      }
      // a range of mountains closing off the right side, so the edge of the land never shows
      const rr = rng(33);
      for (let i = 0; i < 26; i++) {
        const row = i % 3, h = 12 + rr() * 16 + row * 3;
        const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(14 + rr() * 14, h, 6 + Math.floor(rr() * 3))), hillMats[i % 3]);
        cone.position.set(52 + Math.floor(i / 3) * 17 + rr() * 8, h / 2 - 1, -34 - row * 24 - rr() * 14 + (i % 2 ? 0 : -50));
        cone.rotation.y = rr() * 3;
        scene.add(cone);
      }
      // scattered rocks and shrubs for depth
      const rock = mat(0x5d6b62), shrub = mat(0x2c4a3e);
      for (let i = 0; i < 26; i++) {
        const x = -60 + rh() * (MOAT_L - 1.5 + 60), z = -30 + rh() * 40; // stay on the field side of the moat
        if (Math.abs(z - BRIDGE_Z) < 3 && x > -2) continue;
        const s = 0.4 + rh() * 0.9;
        const m = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(s, 0)), rh() < 0.5 ? rock : shrub);
        m.position.set(x, s * 0.4, z); m.rotation.set(rh() * 3, rh() * 3, 0);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    }

    /* ── 3D grass: tens of thousands of instanced blades that sway in the wind and heave with each footfall ── */
    let grassMat;
    function buildGrass() {
      // one blade: a bent, tapered strip, dark at the root and light at the tip
      const gp = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.34, 0.5, 0.04, 0.34, 0.5, 0.04, 0.1, 1, 0.14]);
      const gc = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1.15, 1.15, 1.15]);
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      g.setAttribute('color', new THREE.BufferAttribute(gc, 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
      g.computeVertexNormals();
      grassMat = mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, flatShading: false, roughness: 0.9 });
      grassMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = { value: 0 };
        sh.uniforms.uImp = { value: IMPACTS.map((p) => new THREE.Vector3(p.x, p.z, p.t)) };
        sh.vertexShader = 'uniform float uTime;\nuniform vec3 uImp[8];\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 bw = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float hh = position.y;
          float sway = sin(uTime * 1.6 + bw.x * 0.35 + bw.y * 0.27) * 0.16 + sin(uTime * 3.1 + bw.x * 0.9) * 0.05;
          transformed.x += sway * hh * hh;
          float dy = 0.0;
          for (int i = 0; i < 8; i++) {
            vec3 im = uImp[i];
            float a = uTime - im.z;
            if (a >= 0.0 && a < 2.4) {
              float d = distance(bw, im.xy), front = a * 16.0;
              if (d < front && d > 3.0) dy += 0.55 * exp(-a * 1.8) * exp(-(front - d) * 0.25) * sin((d - front) * 1.1);
            }
          }
          transformed.y += dy / instanceMatrix[1][1];`);
        grassMat.userData.shader = sh;
      };
      const rand = rng(77), pal = [0x4c7640, 0x588545, 0x436b3b, 0x628f50, 0x56803a].map((h) => new THREE.Color(h));
      const spots = [];
      const inCastle = (x, z) => x > 8.6 && x < 28.5 && z > -13.5 && z < 8.8; // keep blades out of the castle's footprint
      const scatter = (x0, x1, z0, z1, per) => {
        const n = Math.round((x1 - x0) * (z1 - z0) * per);
        for (let i = 0; i < n; i++) { const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0); if (!inCastle(x, z)) spots.push([x, z]); }
      };
      const bank = MOAT_L - 0.7, far = MOAT_R + 0.6;
      // the field side of the moat: dense close in, thinning out to the left and back
      scatter(-52, bank, -26, 24, 9);
      scatter(-110, -52, -40, 24, 4.4);
      scatter(-150, -110, -48, 24, 2.4);
      scatter(-52, bank, -60, -26, 3.2);
      // the castle side of the moat, round the castle and out to the mountains
      scatter(far, 28.5, 8.8, 24, 7);
      scatter(far, 28.5, -26, -13.5, 7);
      scatter(28.5, 75, -26, 24, 5);
      scatter(far, 75, -60, -26, 2.8);
      scatter(75, 135, -60, 24, 2.2);
      const im = new THREE.InstancedMesh(g, grassMat, spots.length);
      im.receiveShadow = true;
      im.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      spots.forEach(([x, z], i) => {
        const hgt = 0.5 + rand() * 0.85;
        e.set(0, rand() * Math.PI * 2, 0); q.setFromEuler(e);
        m.compose(p.set(x, 0, z), q, sc.set(0.16 + rand() * 0.16, hgt, 1));
        im.setMatrixAt(i, m);
        im.setColorAt(i, pal[Math.floor(rand() * pal.length)]);
      });
      scene.add(im);
    }

    /* ── forest: instanced low-poly pines, in clumps along the foot of the mountains on both sides ── */
    function buildForest() {
      const rand = rng(55);
      const clump = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.09 + Math.sin(z * 0.13) * 2.2) * Math.cos(z * 0.08 - x * 0.05); // 0..1 blobs
      const trees = [];
      // keep the giant's whole walk (and the dust it throws up) clear of trees
      const path = [];
      for (let i = 0; i < BOSS_STEPS; i++) for (let k = 0; k < 4; k++) path.push([WALK.c[i][0] + (WALK.c[i + 1][0] - WALK.c[i][0]) * k / 4, WALK.c[i][1] + (WALK.c[i + 1][1] - WALK.c[i][1]) * k / 4]);
      path.push(WALK.c[BOSS_STEPS]);
      const nearBoss = (x, z) => path.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 27);
      const place = (x0, x1, z0, z1, tries, thresh) => {
        for (let i = 0; i < tries; i++) {
          const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
          if (clump(x, z) < thresh) continue;
          if (x > 6 && x < 34 && z > -18 && z < 14) continue; // not on the castle or its gate
          if (nearBoss(x, z)) continue;
          trees.push([x, z, 0.55 + rand() * 0.55 + (z < -50 ? 0.25 : 0)]);
        }
      };
      place(-150, -8, -78, -46, 900, 0.58); // along the far edge of the field, low enough to leave the mountains showing
      place(-150, -80, -46, 24, 380, 0.66); // out on the left
      place(12, 150, -80, -34, 900, 0.56); // behind and beside the castle
      place(34, 150, -34, 26, 460, 0.64);  // down the right-hand side
      const n = trees.length;
      const parts = [
        { g: new THREE.CylinderGeometry(0.22, 0.32, 1.5, 5), y: 0.75, col: 0x4a3626 },
        { g: new THREE.ConeGeometry(1.9, 3.3, 7), y: 2.7, col: 0xffffff },
        { g: new THREE.ConeGeometry(1.4, 2.7, 7), y: 4.5, col: 0xffffff },
      ];
      const pal = [0x2d5a3a, 0x356a45, 0x28503a, 0x3f7448, 0x2f5f40].map((h) => new THREE.Color(h));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      parts.forEach((pt, k) => {
        const im = new THREE.InstancedMesh(geo(pt.g), mat(k ? 0xffffff : pt.col), n);
        im.frustumCulled = false; im.receiveShadow = true;
        trees.forEach(([x, z, s], i) => {
          e.set(0, ((i * 2.399) % 6.283), 0); q.setFromEuler(e);
          m.compose(p.set(x, pt.y * s, z), q, sc.set(s, s, s));
          im.setMatrixAt(i, m);
          if (k) im.setColorAt(i, pal[i % pal.length]);
        });
        scene.add(im);
      });
    }

    /* ── the code castle ── */
    function merlons(parent, m, x0, x1, z0, z1, y, step) {
      const lx = x1 - x0, lz = z1 - z0, n = Math.max(1, Math.round(Math.hypot(lx, lz) / step));
      for (let i = 0; i <= n; i += 2) {
        const f = i / n;
        box(lx ? step : 0.5, 0.8, lz ? step : 0.5, m, x0 + lx * f, y + 0.4, z0 + lz * f, parent);
      }
    }
    function tower(x, z, rad, h, roofCol, flagCol) {
      const stone = mat(0xb8b9a8), dark = mat(0x8f927f);
      cyl(rad, rad * 1.08, h, 10, stone, x, h / 2, z);
      cyl(rad * 1.18, rad * 1.18, 0.6, 10, dark, x, h + 0.3, z);
      for (let i = 0; i < 10; i += 2) {
        const a = (i / 10) * Math.PI * 2;
        box(0.7, 0.9, 0.7, dark, x + Math.cos(a) * rad * 1.1, h + 1.05, z + Math.sin(a) * rad * 1.1).rotation.y = -a;
      }
      const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(rad * 1.3, rad * 2.2, 10)), mat(roofCol));
      roof.position.set(x, h + 0.6 + rad * 1.1 + 0.6, z); roof.castShadow = true; scene.add(roof);
      // windows
      const win = mat(0xf5b726, { emissive: 0xf5a020, emissiveIntensity: 1.4 });
      box(0.15, 0.9, 0.45, win, x - rad * 1.02, h * 0.62, z);
      addFlag(x, h + 0.6 + rad * 2.2 + 0.6, z, flagCol);
    }
    function addFlag(x, y, z, col) {
      const pole = cyl(0.06, 0.06, 2.4, 5, mat(0x3b3226), x, y + 1.0, z);
      pole.castShadow = false;
      const g = geo(new THREE.PlaneGeometry(2.0, 1.1, 10, 3));
      g.translate(1.0, 0, 0);
      const f = new THREE.Mesh(g, mat(col, { side: THREE.DoubleSide, flatShading: false, roughness: 0.7 }));
      f.position.set(x, y + 1.65, z);
      f.rotation.y = 0.5;
      f.castShadow = true;
      scene.add(f);
      flags.push({ mesh: f, base: Float32Array.from(g.attributes.position.array), phase: flags.length * 1.7 });
    }

    function buildCastle() {
      const stone = mat(0xb8b9a8), stone2 = mat(0xa5a795), dark = mat(0x8f927f), hole = mat(0x141c1a, { roughness: 1 });
      // curtain wall facing the field (along z), with a wall walk at y=6
      box(1.6, 6, 15, stone, 11.6, 3, -2.2);
      merlons(null, dark, 10.95, 10.95, -9.4, 5.0, 6, 0.7);
      // side walls running back
      box(14, 5.5, 1.4, stone2, 18.5, 2.75, -9.6);
      box(14, 5.5, 1.4, stone2, 18.5, 2.75, 5.2);
      merlons(null, dark, 12, 25, 5.75, 5.75, 5.5, 0.7);
      // gatehouse
      box(3.6, 9, 4.6, stone2, 12.4, 4.5, BRIDGE_Z);
      merlons(null, dark, 10.75, 10.75, BRIDGE_Z - 2.1, BRIDGE_Z + 2.1, 9, 0.7);
      // the dark gateway is a flat panel on the gatehouse face (nothing sticks out for the raised bridge to cut through)
      box(0.06, 3.6, 3.2, hole, 10.57, 1.8, BRIDGE_Z);
      const arch = new THREE.Mesh(geo(new THREE.CircleGeometry(1.6, 20, 0, Math.PI)), hole);
      arch.rotation.y = -Math.PI / 2; // face the field
      arch.position.set(10.535, 3.6, BRIDGE_Z); scene.add(arch);
      // portcullis bars
      const iron = mat(0x2b2b2b, { metalness: 0.6, roughness: 0.4 });
      for (let i = -3; i <= 3; i++) box(0.12, 4.6, 0.12, iron, 10.56, 2.3, BRIDGE_Z + i * 0.42);
      // towers at the corners of the front wall
      tower(11.8, -10.2, 2.0, 10.5, BRAND.orange, BRAND.ochre);
      tower(11.8, 5.8, 2.0, 10.5, BRAND.orange, BRAND.sky);
      // keep
      box(7, 14, 7, stone, 20, 7, -2.4);
      merlons(null, dark, 16.4, 16.4, -5.8, 1.0, 14, 0.7);
      merlons(null, dark, 16.4, 23.6, 1.0, 1.0, 14, 0.7);
      tower(23.5, -6.5, 1.5, 18, BRAND.pink, BRAND.orange);
      tower(16.8, -6.2, 1.1, 16.5, BRAND.orange, BRAND.ochre);
      const win = mat(0xf5b726, { emissive: 0xf5a020, emissiveIntensity: 1.2 });
      [[8.5, -4], [8.5, -0.8], [11.5, -2.4]].forEach(([y, z]) => box(0.15, 1.1, 0.6, win, 16.45, y, z));

      // CODE CASTLE banner on the keep, facing the camera
      const tex = canvasTex(1024, 220, (g, w, h) => {
        g.fillStyle = '#F2F2EB'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2E4742'; g.fillRect(10, 10, w - 20, h - 20);
        g.strokeStyle = '#F5B726'; g.lineWidth = 6; g.strokeRect(26, 26, w - 52, h - 52);
        g.fillStyle = '#F2F2EB'; g.font = '700 118px "Martian Mono", ui-monospace, monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('CODE CASTLE', w / 2, h / 2 + 6, w - 90);
      });
      disposables.push(tex);
      const banner = new THREE.Mesh(geo(new THREE.PlaneGeometry(7.6, 1.64)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
      disposables.push(banner.material);
      banner.position.set(20.6, 11.2, 1.2);
      scene.add(banner);
      cyl(0.08, 0.08, 8.4, 5, mat(0x3b3226), 20.6, 12, 1.3).rotation.z = Math.PI / 2;

      // the castle's sign, hung under the CODE CASTLE banner: an OPEN TO CONTRIBUTION board that drops into a slot
      // in the wall (it is clipped at the slot's edge) and reveals the CLOSED board behind it
      const signTex = (bg, lines, size) => {
        const t = canvasTex(1024, 340, (g, w, h) => {
          g.fillStyle = '#F2F2EB'; g.fillRect(0, 0, w, h);
          g.fillStyle = bg; g.fillRect(14, 14, w - 28, h - 28);
          g.fillStyle = '#F2F2EB'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `800 ${size}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
          lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 0.98 + 4, w - 80));
        });
        disposables.push(t);
        return t;
      };
      const SIGN_X = 20.6, SIGN_Y = 8.5, SLOT_Y = SIGN_Y - 1.0; // the slot is the bottom edge of the board
      const slot = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLOT_Y); // keeps everything above y = SLOT_Y
      const makeBoard = (tex, z, clip) => {
        const g = new THREE.Group();
        const wood = mat(0x4a3320, clip ? { clippingPlanes: [slot] } : {});
        box(5.6, 2.0, 0.14, wood, 0, 0, 0, g);
        const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.4, ...(clip ? { clippingPlanes: [slot] } : {}) });
        disposables.push(fm);
        const face = new THREE.Mesh(geo(new THREE.PlaneGeometry(5.4, 1.8)), fm);
        face.position.z = 0.08;
        g.add(face);
        g.position.set(SIGN_X, SIGN_Y, z);
        scene.add(g);
        return g;
      };
      signClosed = makeBoard(signTex(`#${new THREE.Color(BRAND.orange).getHexString()}`, ['CLOSED'], 190), 1.3, false);
      signOpen = makeBoard(signTex('#2f8f4a', ['OPEN TO', 'CONTRIBUTION'], 120), 1.5, true);
      // rod and two chains the boards hang from, and the ledge of the slot
      box(5.8, 0.14, 0.14, iron, SIGN_X, SIGN_Y + 1.55, 1.4);
      [-2.4, 2.4].forEach((x) => box(0.07, 0.6, 0.07, iron, SIGN_X + x, SIGN_Y + 1.28, 1.4));
      box(5.9, 0.14, 0.5, mat(0x4a3320), SIGN_X, SLOT_Y - 0.07, 1.4);

      // torches either side of the gate
      [BRIDGE_Z - 2.8, BRIDGE_Z + 2.8].forEach((z) => {
        box(0.3, 0.3, 0.3, iron, 10.5, 4.3, z);
        const flame = new THREE.Mesh(geo(new THREE.ConeGeometry(0.28, 0.9, 6)), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
        disposables.push(flame.material);
        flame.position.set(10.4, 4.95, z); scene.add(flame);
        const light = new THREE.PointLight(0xff9a3c, 14, 12, 1.6);
        light.position.set(9.6, 5.1, z); scene.add(light);
        torches.push({ flame, light, z });
      });
    }

    /* ── drawbridge: plank hinged at the gate, plus two chains ── */
    function buildBridge() {
      bridge = new THREE.Group();
      bridge.position.set(HINGE_X, 0.05, BRIDGE_Z);
      scene.add(bridge);
      const wood = mat(0x8b5a2b), wood2 = mat(0x6e4520), iron = mat(0x2b2b2b, { metalness: 0.6, roughness: 0.4 });
      for (let i = 0; i < 7; i++) box(BRIDGE_LEN, 0.28, 0.44, i % 2 ? wood : wood2, -BRIDGE_LEN / 2, 0.14, -1.4 + i * 0.467, bridge);
      box(0.3, 0.34, 3.4, iron, -BRIDGE_LEN + 0.3, 0.2, 0, bridge);
      box(0.3, 0.34, 3.4, iron, -1.2, 0.2, 0, bridge);
      const chainMat = mat(0x3a3a3a, { metalness: 0.7, roughness: 0.35 });
      for (const dz of [-1.55, 1.55]) {
        const c = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 1, 5)), chainMat);
        c.castShadow = true; scene.add(c);
        chains.push({ mesh: c, dz });
      }
    }
    const bridgeAngle = (t) => RAISE_MAX * ease((t - RAISE_AT) / RAISE_DUR);
    // world point on the plank at distance d from the hinge
    function onPlank(d, t, out) {
      const a = bridgeAngle(t);
      return out.set(HINGE_X - d * Math.cos(a), 0.33 + d * Math.sin(a), BRIDGE_Z);
    }

    /* ── robot swarm: instanced parts, one matrix per part per robot ── */
    const BOT_PARTS = [
      // [w, h, d, x, y, z, material key, limb swing (0 none, ±1)]
      [0.92, 0.82, 0.62, 0, 0.95, 0, 'body', 0],
      [0.74, 0.58, 0.58, 0, 1.68, 0, 'head', 0],
      [0.17, 0.17, 0.06, -0.18, 1.72, 0.3, 'eye', 0],
      [0.17, 0.17, 0.06, 0.18, 1.72, 0.3, 'eye', 0],
      [0.38, 0.07, 0.05, 0, 1.52, 0.3, 'dark', 0],
      [0.04, 0.3, 0.04, 0, 2.1, 0, 'metal', 0],
      [0.14, 0.14, 0.14, 0, 2.3, 0, 'bulb', 0],
      [0.1, 0.24, 0.24, -0.42, 1.68, 0, 'metal', 0],
      [0.1, 0.24, 0.24, 0.42, 1.68, 0, 'metal', 0],
      [0.5, 0.34, 0.05, 0, 1.0, 0.33, 'dark', 0],
      [0.12, 0.12, 0.05, -0.12, 1.0, 0.36, 'eye', 0],
      [0.12, 0.12, 0.05, 0.12, 1.0, 0.36, 'bulb', 0],
      [0.18, 0.66, 0.18, -0.6, 1.0, 0.05, 'metal', 1],
      [0.18, 0.66, 0.18, 0.6, 1.0, 0.05, 'metal', -1],
      [0.24, 0.58, 0.26, -0.22, 0.29, 0, 'metal', -1],
      [0.24, 0.58, 0.26, 0.22, 0.29, 0, 'metal', 1],
    ];
    function buildSwarm() {
      const rand = rng(42);
      const N = 56;
      const mats = {
        body: mat(0xffffff, { metalness: 0.3, roughness: 0.4 }),
        head: mat(0xffffff, { metalness: 0.3, roughness: 0.4 }),
        eye: mat(0x001418, { emissive: 0x38e8ff, emissiveIntensity: 2.6 }),
        bulb: mat(0x200000, { emissive: 0xff3b2a, emissiveIntensity: 2.4 }),
        dark: mat(0x1a1f26, { metalness: 0.2, roughness: 0.6 }),
        metal: mat(0x59616d, { metalness: 0.6, roughness: 0.4 }),
      };
      const bots = [];
      const tint = [0xe3e8ee, 0xc9d3de, 0xb7c9de, 0xeae4d8, 0xa9c4e6];
      for (let i = 0; i < N; i++) {
        // rest spot: piled up along the moat's edge, later arrivals climb on top
        const row = i % 3, col = Math.floor(i / 3);
        const zf = -8 + ((col * 0.83 + rand() * 0.6) % 14);
        const xf = MOAT_L - 0.8 - row * 1.05 - rand() * 0.35;
        const arrive = 3.6 + (i / N) * 7.0 + rand() * 0.8;
        const x0 = -44 - rand() * 18;
        bots.push({
          x0, xf, zf, z0: zf + (rand() - 0.5) * 2.5, arrive, start: Math.max(0, arrive - (xf - x0) / (6.5 + rand() * 3)),
          phase: rand() * 6.28, rate: rand() * 3, hop: 0.6 + rand() * 1.0, color: new THREE.Color(tint[Math.floor(rand() * tint.length)]), scale: 1.15 + rand() * 0.35, stack: 0,
        });
      }
      // stack bots that landed near an earlier one
      bots.forEach((b, i) => { for (let j = 0; j < i; j++) { const o = bots[j]; if (Math.abs(o.xf - b.xf) < 0.7 && Math.abs(o.zf - b.zf) < 0.7 && rand() < 0.6) b.stack = Math.min(2, o.stack + 1); } });
      swarm = { bots, mats, meshes: BOT_PARTS.map((p) => {
        const im = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(p[0], p[1], p[2])), mats[p[6]], N + 2);
        im.castShadow = p[6] !== 'eye' && p[6] !== 'bulb';
        im.frustumCulled = false; // instances are spread over the scene; the origin leaving the view must not hide them all
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(im);
        return im;
      }) };
      bots.forEach((b, i) => { swarm.meshes[0].setColorAt(i, b.color); swarm.meshes[1].setColorAt(i, b.color); });
      // the two lead bots (instances N, N+1) sprint up to the bank just as the bridge is hauled up, and run straight into the moat
      const leadColor = new THREE.Color(tint[0]);
      leads = [
        { i: N, s: 1.7, speed: 7.7, tb: 4.5, z: BRIDGE_Z - 0.6, vx: 6.4, vy: 2.4, spin: 5, color: leadColor },
        { i: N + 1, s: 1.7, speed: 8.9, tb: 4.85, z: BRIDGE_Z + 0.7, vx: 7.4, vy: 3.4, spin: -4, color: leadColor },
      ];
      leads.forEach((l) => {
        swarm.meshes[0].setColorAt(l.i, l.color); swarm.meshes[1].setColorAt(l.i, l.color);
        // time to fall from the bank to the water, then where they hit it
        const dtFall = (l.vy + Math.sqrt(l.vy * l.vy + 36 * -WATER_Y)) / 18;
        l.splash = l.tb + dtFall;
        l.sx = MOAT_L + l.vx * dtFall;
      });
      swarm.meshes.forEach((im) => { if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    }

    const EYE_COOL = new THREE.Color(0x38e8ff), EYE_HOT = new THREE.Color(0xff2a1a);
    function botPose(t, b) {
      // returns {x,y,z,rx,rz,swing,armUp,s} for a swarm bot: charging, then an angry jumping mob at the moat
      const p = clamp((t - b.start) / (b.arrive - b.start));
      const running = p < 1;
      const settle = ease((t - b.arrive) / 0.4);
      const cyc = t * 13 + b.phase;
      // the mob: hop up and down at their own rhythm, shuffle and jostle, fists in the air
      const hopT = t * (6.5 + b.rate) + b.phase, hop = Math.pow(Math.abs(Math.sin(hopT)), 0.85) * b.hop * settle;
      const x = (b.x0 + (b.xf - b.x0) * p) + (running ? 0 : Math.sin(t * 4.3 + b.phase) * 0.22 * settle);
      const z = (b.z0 + (b.zf - b.z0) * ease(p)) + (running ? 0 : Math.sin(t * 3.1 + b.phase * 1.7) * 0.18 * settle);
      const y = running ? Math.abs(Math.sin(cyc)) * 0.35 : b.stack * 1.55 * settle + hop;
      const air = Math.cos(hopT); // legs kick out as they leave the ground
      return {
        x, y, z, rx: running ? 0.22 : 0.12 * Math.sin(hopT * 2 + b.phase), rz: running ? 0 : 0.1 * Math.sin(t * 5 + b.phase) * settle,
        swing: running ? Math.sin(cyc) * 0.8 : air * 0.7 * settle, armUp: running ? 0 : settle, shake: Math.sin(t * 22 + b.phase), s: b.scale,
      };
    }
    function leadPose(t, l) {
      const cyc = t * 15 + l.i;
      if (t < l.tb) return { x: MOAT_L + l.speed * (t - l.tb), y: Math.abs(Math.sin(cyc)) * 0.35, z: l.z, rx: 0.25, rz: 0, swing: Math.sin(cyc) * 0.9, s: l.s };
      // off the edge: a short hop, then the drop into the water and out of sight
      const dt = Math.min(t, l.splash) - l.tb, sink = Math.max(0, t - l.splash);
      return {
        x: MOAT_L + l.vx * dt, y: Math.max(WATER_Y - sink * 2.4, l.vy * dt - 9 * dt * dt), z: l.z,
        rx: 0, rz: -l.spin * dt, swing: Math.sin(t * 30) * 1.2, s: sink > 0.9 ? 0 : l.s,
      };
    }

    const pm = new THREE.Matrix4(), root = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    function setBot(i, ps) {
      e.set(ps.rx, 0.85, ps.rz, 'ZYX'); // lean forward, face the camera at three-quarters, tilt/tumble in world space
      q.setFromEuler(e);
      root.compose(pv.set(ps.x, ps.y, ps.z), q, sv.set(ps.s, ps.s, ps.s));
      for (let k = 0; k < BOT_PARTS.length; k++) {
        const p = BOT_PARTS[k];
        dummy.position.set(p[3], p[4], p[5]);
        dummy.rotation.set(0, 0, 0);
        if (k === 12 || k === 13) { // arms hang off the shoulder: swing while running, fists up when angry
          const up = ps.armUp || 0, ang = (1 - up) * p[7] * ps.swing - up * (2.35 + 0.3 * (ps.shake || 0));
          dummy.rotation.x = ang;
          dummy.position.set(p[3], 1.33 - 0.33 * Math.cos(ang), 0.05 - 0.33 * Math.sin(ang));
        } else if (p[7]) dummy.rotation.x = p[7] * ps.swing; // legs swing back and forth
        dummy.updateMatrix();
        pm.multiplyMatrices(root, dummy.matrix);
        swarm.meshes[k].setMatrixAt(i, pm);
      }
    }

    /* ── the colossal AI: beveled, extruded block letters with a hot rim ── */
    function letterShape(ch, dx) {
      const sh = new THREE.Shape();
      const poly = (path, pts) => { path.moveTo(pts[0][0] + dx, pts[0][1]); pts.slice(1).forEach((p) => path.lineTo(p[0] + dx, p[1])); path.closePath(); };
      if (ch === 'A') {
        poly(sh, [[-7, 0], [-3.1, 18], [3.1, 18], [7, 0], [3.7, 0], [2.75, 4.4], [-2.75, 4.4], [-3.7, 0]]);
        const hole = new THREE.Path();
        poly(hole, [[-1.75, 7.6], [1.75, 7.6], [0.35, 14.4], [-0.35, 14.4]]);
        sh.holes.push(hole);
      } else {
        poly(sh, [[-4.6, 0], [4.6, 0], [4.6, 3.2], [2.1, 3.2], [2.1, 14.8], [4.6, 14.8], [4.6, 18], [-4.6, 18], [-4.6, 14.8], [-2.1, 14.8], [-2.1, 3.2], [-4.6, 3.2]]);
      }
      return sh;
    }
    function buildBoss() {
      boss = { letters: [], lights: [] };
      // black block letters; a soft warm light underneath and the dusk sky behind are what define them
      const face = mat(0x050506, { metalness: 0.1, roughness: 0.5 });
      const rim = mat(0x030304, { emissive: 0x000000, emissiveIntensity: 0, metalness: 0.15, roughness: 0.45 });
      boss.rim = rim;
      LETTERS.forEach((L) => {
        // A and I side by side in one geometry, so they move as a single word
        const g = geo(new THREE.ExtrudeGeometry([letterShape('A', -5.7), letterShape('I', 8.1)], { depth: 4.2, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.55, bevelSegments: 2, curveSegments: 4 }));
        g.translate(0, -9, -2.1); // spin about the word's centre
        const m = new THREE.Mesh(g, [face, rim]);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        // red under-glow that travels with the word
        const light = new THREE.PointLight(0xffb48a, 12, 34, 1.6);
        scene.add(light);
        boss.letters.push({ m, L, light });
      });
    }
    // the word's pose at time t. Each rock: a base corner stays planted, the word tips up onto it, hangs a beat while it
    // twists about that corner (the far end swinging forward), then the raised corner slams down and the word squashes.
    function letterPose(t) {
      const { side, psi, c, T, P } = WALK;
      let i = 0; while (i < BOSS_STEPS - 1 && t >= T[i + 1]) i++;
      if (t < T[0]) return { px: 0, pz: 0, cx: c[0][0], cz: c[0][1], yaw: psi[0], tilt: 0, side: side[0], sq: 1, still: true };
      const done = t >= T[BOSS_STEPS], s = side[i], ff = done ? 1 : (t - T[i]) / P[i];
      const e = ease((ff - 0.18) / (SLAM - 0.18)), yaw = psi[i] + (psi[i + 1] - psi[i]) * e;
      // the planted corner, fixed in the world for the whole rock
      const px = c[i][0] + s * BOSS_A * Math.cos(psi[i]), pz = c[i][1] - s * BOSS_A * Math.sin(psi[i]);
      const amp = i === BOSS_STEPS - 1 ? 0.3 : 0.16; // ~9 degrees, a heavier heave for the big swing
      const up = ease(ff / 0.36), down = ease((ff - 0.56) / (SLAM - 0.56));
      const a = t - (T[i] + P[i] * SLAM); // settle after the thud: damped squash
      const sq = a > 0 ? 1 - 0.09 * Math.exp(-a * 6) * Math.cos(a * 22) : 1;
      return { px, pz, yaw, tilt: amp * up * (1 - down), side: s, sq, still: false };
    }
    function poseBoss(t) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 5);
      boss.letters.forEach(({ m, light }) => {
        const p = letterPose(t);
        let x, y, z, th = 0;
        if (p.still) { x = p.cx; z = p.cz; y = 9 * LS; } else {
          // centre = planted corner + the word's own offset from it (tilted about the corner), turned by the current facing
          const h = 9 * LS * p.sq;
          th = -p.side * p.tilt;
          const ox = -p.side * BOSS_A * Math.cos(th) - h * Math.sin(th), oy = -p.side * BOSS_A * Math.sin(th) + h * Math.cos(th);
          x = p.px + ox * Math.cos(p.yaw); z = p.pz - ox * Math.sin(p.yaw); y = oy;
        }
        m.position.set(x, y, z);
        m.rotation.set(0, p.yaw ?? WALK.psi[0], th);
        m.scale.set(LS * (1 + (1 - p.sq) * 0.5), LS * p.sq, LS);
        light.position.set(x, 2.5, z + 8);
        light.intensity = 9 + pulse * 5 + 18 * p.tilt;
      });
    }

    /* ── particles: footfall dust, splash, embers ── */
    function dotTex() {
      return canvasTex(64, 64, (g) => {
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      });
    }
    function points(n, size, tex, blending) {
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: blending || THREE.NormalBlending, sizeAttenuation: true });
      disposables.push(m);
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      scene.add(p);
      return p;
    }
    const DUST_PER = 44, SPLASH_PER = 40, EMBERS = 40;
    function buildParticles() {
      const tex = dotTex(); disposables.push(tex);
      const rand = rng(99);
      dust = points(IMPACTS.length * DUST_PER * 2, 2.6, tex);
      dust.seeds = Array.from({ length: IMPACTS.length * DUST_PER * 2 }, () => [rand(), rand(), rand()]);
      splash = points(leads.length * SPLASH_PER, 0.7, tex);
      splash.seeds = Array.from({ length: leads.length * SPLASH_PER }, () => [rand(), rand(), rand()]);
      embers = points(EMBERS, 0.35, tex, THREE.AdditiveBlending);
      embers.seeds = Array.from({ length: EMBERS }, () => [rand(), rand(), rand()]);
    }
    function updateParticles(t) {
      // dust: a ring kicked up around each landed foot
      let pa = dust.geometry.attributes.position.array, ca = dust.geometry.attributes.color.array, n = 0;
      IMPACTS.forEach((imp) => {
        const ti = imp.t;
        for (let j = 0; j < DUST_PER * 2; j++, n++) {
          const [a, b, c] = dust.seeds[n], age = t - ti;
          if (age < 0 || age > 2.6) { ca[n * 4 + 3] = 0; continue; }
          const ang = a * Math.PI * 2, sp = 2 + b * 5, out = (1 - Math.exp(-age * 2.2)) * sp;
          // a low ring rushing out from under the letter, plus a slower billowing plume
          const ring = j % 2 === 0, rad = (ring ? 7 : 4) + out * (ring ? 1.6 : 0.8);
          pa[n * 3] = imp.x + Math.cos(ang) * rad; pa[n * 3 + 2] = imp.z + Math.sin(ang) * rad * 0.7;
          pa[n * 3 + 1] = ring ? 0.3 + c * 0.6 : 0.5 + c * 4.5 * (1 - Math.exp(-age * 1.6));
          ca.set([0.82, 0.74, 0.6, (ring ? 0.7 : 0.45) * (1 - age / 2.6) * Math.min(1, age * 10)], n * 4);
        }
      });
      dust.geometry.attributes.position.needsUpdate = dust.geometry.attributes.color.needsUpdate = true;
      // splash: droplets from each lead bot's fall
      pa = splash.geometry.attributes.position.array; ca = splash.geometry.attributes.color.array; n = 0;
      leads.forEach((l) => {
        for (let j = 0; j < SPLASH_PER; j++, n++) {
          const [a, b, c] = splash.seeds[n], age = t - l.splash;
          if (age < 0 || age > 1.4) { ca[n * 4 + 3] = 0; continue; }
          const ang = a * Math.PI * 2, sp = 1 + b * 2.2, vy = 5 + c * 6;
          pa[n * 3] = l.sx + Math.cos(ang) * sp * age; pa[n * 3 + 1] = Math.max(WATER_Y, WATER_Y + vy * age - 9.8 * age * age); pa[n * 3 + 2] = l.z + Math.sin(ang) * sp * age;
          ca.set([0.8, 0.92, 1, 0.9 * (1 - age / 1.4)], n * 4);
        }
      });
      splash.geometry.attributes.position.needsUpdate = splash.geometry.attributes.color.needsUpdate = true;
      // embers drifting up from the torches
      pa = embers.geometry.attributes.position.array; ca = embers.geometry.attributes.color.array;
      for (let j = 0; j < EMBERS; j++) {
        const [a, b, c] = embers.seeds[j], life = 2.2 + b, age = ((t + a * life) % life), k = age / life;
        const z = torches[j % 2].z;
        pa[j * 3] = 10.2 - age * 0.5 + Math.sin(age * 3 + c * 6) * 0.25; pa[j * 3 + 1] = 5.1 + age * 1.4; pa[j * 3 + 2] = z + Math.cos(age * 2 + a * 6) * 0.3;
        ca.set([1, 0.6 + 0.3 * c, 0.2, (1 - k) * 0.9], j * 4);
      }
      embers.geometry.attributes.position.needsUpdate = embers.geometry.attributes.color.needsUpdate = true;
    }

    // footfall shock: sum of decaying impulses
    function shock(t) {
      let s = 0;
      for (const { t: ti } of IMPACTS) { const a = t - ti; if (a >= 0 && a < 1.2) s += Math.exp(-a * 4) * Math.sin(a * 48) * 1.7; }
      return s;
    }

    function rippleGround(t) {
      const pos = ground.geometry.attributes.position, arr = pos.array;
      const live = [];
      IMPACTS.forEach((imp) => { const a = t - imp.t; if (a >= 0 && a < 2.4) live.push([imp.x, imp.z, a]); });
      if (!live.length && !rippleGround.dirty) return;
      rippleGround.dirty = live.length > 0;
      for (let i = 0; i < pos.count; i++) {
        const x = groundBase[i * 3], z = groundBase[i * 3 + 2];
        let y = groundBase[i * 3 + 1];
        for (const [fx, fz, a] of live) {
          const d = Math.hypot(x - fx, z - fz), front = a * 16;
          if (d < front && d > 3) y += 0.55 * Math.exp(-a * 1.8) * Math.exp(-(front - d) * 0.25) * Math.sin((d - front) * 1.1);
        }
        arr[i * 3 + 1] = y;
      }
      pos.needsUpdate = true;
      ground.geometry.computeVertexNormals();
    }

    // keep the drawing buffer matched to the stage (the slide's flex layout decides its height)
    let lastW = 0, lastH = 0;
    function fit() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w; lastH = h;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    const CAM = [ // [t, pos, target]
      [0, [-14, 14, 60], [-2, 10.5, -4]],
      [2.6, [-11, 11, 46], [2, 8, -3]],
      [4.7, [-4, 7, 27], [7, 3.6, -1]],
      [6.8, [-3, 7.5, 29], [6, 4, -1]],
      [10.6, [-7, 13, 51], [2, 10.4, -4]],
      [END, [-6, 13, 50], [2, 10.4, -4]],
    ];
    const camTarget = new THREE.Vector3();
    function cameraAt(t) {
      let i = 0; while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
      const [ta, pa, la] = CAM[i], [tb, pb, lb] = CAM[i + 1], f = ease((t - ta) / (tb - ta));
      camera.position.set(pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, pa[2] + (pb[2] - pa[2]) * f);
      camTarget.set(la[0] + (lb[0] - la[0]) * f, la[1] + (lb[1] - la[1]) * f, la[2] + (lb[2] - la[2]) * f);
    }

    function render(time) {
      if (!ready) return;
      fit();
      const t = REDUCED || (EXPORT && Scenes.manualTime() === null) ? END : clamp(time, 0, END);

      // boss + where each footfall happened
      poseBoss(t);

      // swarm
      swarm.mats.eye.emissive.lerpColors(EYE_COOL, EYE_HOT, ease((t - 3.4) / 1.4));
      swarm.bots.forEach((b, i) => setBot(i, botPose(t, b)));
      leads.forEach((l) => setBot(l.i, leadPose(t, l)));
      swarm.meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });

      // drawbridge + chains
      const a = bridgeAngle(t);
      bridge.rotation.z = -a;
      chains.forEach((c) => {
        const tip = onPlank(BRIDGE_LEN - 0.3, t, new THREE.Vector3()); tip.z += c.dz;
        stretch(c.mesh, new THREE.Vector3(10.55, 9.4, BRIDGE_Z + c.dz), tip);
      });

      // castle sign: the OPEN board drops into its slot as the drawbridge goes up, revealing CLOSED (which gives a little jolt)
      const swapAt = RAISE_AT + 0.9, u = clamp((t - swapAt) / 0.5), landed = t - swapAt - 0.5;
      signOpen.position.y = 8.5 - 2.6 * u * u + 0.04 * Math.sin(t * 2) * (1 - u);
      signOpen.visible = u < 1;
      signClosed.position.y = 8.5 + (landed > 0 ? 0.12 * Math.exp(-landed * 7) * Math.sin(landed * 30) : 0);

      // flags flutter
      flags.forEach((f) => {
        const p = f.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = f.base[i * 3];
          p.array[i * 3 + 2] = Math.sin(x * 2.4 - t * 7 + f.phase) * 0.18 * x;
          p.array[i * 3 + 1] = f.base[i * 3 + 1] + Math.sin(x * 1.7 - t * 5 + f.phase) * 0.05 * x;
        }
        p.needsUpdate = true;
        f.mesh.geometry.computeVertexNormals();
      });

      torches.forEach((tc, i) => {
        const fl = 0.85 + 0.15 * Math.sin(t * 23 + i * 2) * Math.sin(t * 7.3 + i);
        tc.flame.scale.set(1, fl * 1.1, 1);
        tc.light.intensity = 12 * fl;
      });

      if (grassMat.userData.shader) grassMat.userData.shader.uniforms.uTime.value = t;
      updateParticles(t);
      rippleGround(t);

      // camera: wide, push in on the gate for the drawbridge, pull back out for the boss; shaken by footfalls
      const sh = shock(t) * 0.6;
      cameraAt(t);
      camera.position.x += sh * 0.8; camera.position.y += sh; camera.position.z += sh * 0.4;
      camTarget.y += sh * 0.5; camTarget.x += sh * 0.4;
      camera.lookAt(camTarget);

      r.render(scene, camera);
    }

    function fallback() { stage.classList.add('no-webgl'); }

    return { init, render, fallback, get ready() { return ready; } };
  }

  Scenes.register('siege', siege);
})();
