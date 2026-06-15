/* ============================================================================
 * engine.js — the game itself
 * ----------------------------------------------------------------------------
 * Top-down 2D world: a walkable character, collision, a camera that follows
 * you, depth-sorted rendering, "walk up + press E" interactions that open
 * panels of real content, a quest tracker, and touch controls for mobile.
 *
 * Depends on art.js (Art) and world.js (World). Loaded last.
 * ==========================================================================*/

(() => {
  const TILE = Art.TILE;

  // ---------------------------------------------------------------- state
  let canvas, ctx, wrap;
  let world, player, camX = 0, camY = 0, SCALE = 3;
  let last = 0, waterFrame = 0, waterTimer = 0, lampFrame = 0, lampTimer = 0;
  let activePoi = null, paused = false, interactLocked = false;
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false };
  const visited = new Set();
  const BUILDINGS = ['experience', 'projects', 'skills', 'contact'];

  // pre-rendered sprite caches
  let sprites = {};

  // ------------------------------------------------------------- bootstrap
  function init() {
    canvas = document.getElementById('game-canvas');
    wrap = document.getElementById('game-wrap');
    if (!canvas || !wrap) return;
    ctx = canvas.getContext('2d');

    world = World.buildWorld();
    buildSprites();
    buildOverlay();

    player = {
      x: world.spawn.tx * TILE + TILE / 2,
      y: world.spawn.ty * TILE + TILE,   // feet baseline
      dir: 'down', moving: false, frame: 0, frameTimer: 0,
      speed: 76, // native px / second
    };

    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();

    // flag touch devices so the on-screen controls show (?touch=1 forces it)
    const forceTouch = new URLSearchParams(location.search).has('touch');
    if (forceTouch || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }

    // deep-link: game.html?open=experience jumps straight into a panel
    const openParam = new URLSearchParams(location.search).get('open');
    if (openParam) {
      const p = world.pois.find(poi => poi.id === openParam);
      if (p) openDialog(p);
    }

    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------- sprite caching
  function buildSprites() {
    // ground variants
    sprites.grass = [0, 1, 2, 3].map(i => Art.grassTile(i + 1, false));
    sprites.flower = [0, 1, 2, 3].map(i => Art.grassTile(i + 11, true));
    sprites.path = [0, 1, 2, 3].map(i => Art.pathTile(i + 21));
    sprites.sand = Art.sandTile();
    sprites.water = [0, 1, 2, 3].map(f => Art.waterTile(5, f));
    // objects
    sprites.tree = Art.tree();
    sprites.bush = Art.bush();
    sprites.sign = Art.sign();
    sprites.lamp = [Art.lamp(0), Art.lamp(1)];
    sprites.flowerPatch = [0, 1, 2].map(i => Art.flowerPatch(i + 31));
    sprites.buildings = {};
    Object.keys(World.CONTENT).forEach(k => {
      const d = World.CONTENT[k];
      sprites.buildings[k] = Art.building(d.roof, d.roofDark);
    });
    // character
    sprites.char = Art.characterSheet();
  }

  // pick a stable variant for a tile from its coordinates
  const pick = (arr, tx, ty) => arr[(tx * 7 + ty * 13) % arr.length];

  // ----------------------------------------------------------- responsive
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    canvas.width = w; canvas.height = h;
    SCALE = Math.max(2, Math.min(4, Math.round(Math.min(w / 300, h / 220))));
  }

  // --------------------------------------------------------------- input
  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'escape') { if (!paused) {} else closeDialog(); return; }
    if (k === 'e' || k === ' ' || k === 'enter') {
      if (paused) { /* dialog handles its own close */ }
      else if (!interactLocked && activePoi) { openDialog(activePoi); interactLocked = true; }
      return;
    }
    keys.add(k);
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === 'e' || k === ' ' || k === 'enter') interactLocked = false;
  }

  function inputVector() {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup') || touch.up) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown') || touch.down) dy += 1;
    if (keys.has('a') || keys.has('arrowleft') || touch.left) dx -= 1;
    if (keys.has('d') || keys.has('arrowright') || touch.right) dx += 1;
    return { dx, dy };
  }

  // ----------------------------------------------------------- collision
  function solidAt(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return true;
    return world.solid[ty][tx];
  }
  // foot AABB around the player's feet point
  function footBlocked(px, py) {
    const l = px - 5, r = px + 5, t = py - 6, b = py - 1;
    return solidAt(l, t) || solidAt(r, t) || solidAt(l, b) || solidAt(r, b) || solidAt(px, b);
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (paused) { player.moving = false; return; }
    const { dx, dy } = inputVector();
    let mag = Math.hypot(dx, dy);
    player.moving = mag > 0;

    if (player.moving) {
      const nx = dx / mag, ny = dy / mag;
      const step = player.speed * dt;
      // move per-axis so we slide along walls
      const tryX = player.x + nx * step;
      if (!footBlocked(tryX, player.y)) player.x = tryX;
      const tryY = player.y + ny * step;
      if (!footBlocked(player.x, tryY)) player.y = tryY;
      // facing: dominant axis
      if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 'left' : 'right';
      else if (dy !== 0) player.dir = dy < 0 ? 'up' : 'down';
      // walk animation
      player.frameTimer += dt;
      if (player.frameTimer > 0.16) { player.frameTimer = 0; player.frame ^= 1; }
    } else {
      player.frame = 0;
    }

    // nearest interactable POI within range
    activePoi = null;
    let best = 1e9;
    for (const p of world.pois) {
      const cx = p.ix * TILE + TILE / 2, cy = p.iy * TILE + TILE / 2;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < TILE * 1.5 && d < best) { best = d; activePoi = p; }
    }
    updateHint();

    // animated tiles
    waterTimer += dt; if (waterTimer > 0.22) { waterTimer = 0; waterFrame = (waterFrame + 1) % 4; }
    lampTimer += dt; if (lampTimer > 0.6) { lampTimer = 0; lampFrame ^= 1; }

    // camera follow + clamp
    const viewW = canvas.width / SCALE, viewH = canvas.height / SCALE;
    const worldW = world.w * TILE, worldH = world.h * TILE;
    camX = clamp(player.x - viewW / 2, 0, Math.max(0, worldW - viewW));
    camY = clamp(player.y - viewH / 2 - TILE, 0, Math.max(0, worldH - viewH));
    if (worldW < viewW) camX = (worldW - viewW) / 2;
    if (worldH < viewH) camY = (worldH - viewH) / 2;
    // snap to whole world pixels so scaled tiles tile seamlessly (no 1px gaps)
    camX = Math.round(camX); camY = Math.round(camY);
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- render
  function sx(wx) { return Math.round((wx - camX) * SCALE); }
  function sy(wy) { return Math.round((wy - camY) * SCALE); }
  function blit(img, wx, wy, w, h) {
    ctx.drawImage(img, 0, 0, img.width, img.height, sx(wx), sy(wy), (w || img.width) * SCALE, (h || img.height) * SCALE);
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#4d8a40';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const viewW = canvas.width / SCALE, viewH = canvas.height / SCALE;
    const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(world.w - 1, Math.ceil((camX + viewW) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(world.h - 1, Math.ceil((camY + viewH) / TILE));

    // ground pass
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const g = world.ground[ty][tx];
        let img;
        if (g === 'w') img = sprites.water[waterFrame];
        else if (g === 'p') img = pick(sprites.path, tx, ty);
        else if (g === 's') img = sprites.sand;
        else if (g === 'f') img = pick(sprites.flower, tx, ty);
        else img = pick(sprites.grass, tx, ty);
        blit(img, tx * TILE, ty * TILE, TILE, TILE);
      }
    }

    // flat flower-patch deco (drawn under everything movable)
    for (const o of world.objects) {
      if (o.type === 'flower') blit(pick(sprites.flowerPatch, o.tx, o.ty), o.tx * TILE, o.ty * TILE, TILE, TILE);
    }

    // depth-sorted sprites (objects + player)
    const drawables = [];
    for (const o of world.objects) {
      if (o.type === 'flower') continue;
      if (o.type === 'tree') drawables.push({ y: (o.ty + 1) * TILE, draw: () => blit(sprites.tree, o.tx * TILE, (o.ty - 0.5) * TILE) });
      else if (o.type === 'bush') drawables.push({ y: (o.ty + 1) * TILE, draw: () => blit(sprites.bush, o.tx * TILE, o.ty * TILE) });
      else if (o.type === 'sign') drawables.push({ y: (o.ty + 1) * TILE, draw: () => blit(sprites.sign, o.tx * TILE, o.ty * TILE) });
      else if (o.type === 'lamp') drawables.push({ y: (o.ty + 1) * TILE, draw: () => blit(sprites.lamp[lampFrame], (o.tx * TILE) + 2, (o.ty - 0.5) * TILE) });
      else if (o.type === 'building') drawables.push({ y: (o.ty + 4) * TILE, draw: () => drawBuilding(o) });
    }
    drawables.push({ y: player.y, draw: drawPlayer });
    drawables.sort((a, b) => a.y - b.y);
    drawables.forEach(d => d.draw());

    // "!" bubble over the active POI
    if (activePoi && !paused) drawBubble(activePoi);
  }

  function drawBuilding(o) {
    blit(sprites.buildings[o.key], o.tx * TILE, o.ty * TILE - 0 * TILE);
    // floating name label above roof
    const cx = sx(o.tx * TILE + 2 * TILE);
    const ty = sy(o.ty * TILE) - 6;
    ctx.font = `${10 * (SCALE / 3) + 6}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    const label = `${o.icon} ${o.name}`;
    const w = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(20,24,30,0.78)';
    roundRect(cx - w / 2 - 8, ty - 16, w + 16, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, ty - 2);
    ctx.textAlign = 'left';
  }

  function drawPlayer() {
    const frames = sprites.char[player.dir];
    const img = frames[player.moving ? player.frame : 0];
    // draw so feet baseline sits at player.y, centred on player.x
    blit(img, player.x - 8, player.y - 22, 16, 24);
  }

  function drawBubble(p) {
    const wx = (p.id === 'welcome') ? p.ix * TILE + TILE / 2 : (p.ix * TILE + TILE / 2);
    const wy = (p.id === 'welcome') ? (p.iy - 1) * TILE : (p.iy - 1) * TILE;
    const bob = Math.sin(performance.now() / 250) * 3;
    const cx = sx(wx), cy = sy(wy) + bob;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#33291f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#33291f';
    ctx.font = 'bold 16px "Space Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ----------------------------------------------------------------- loop
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- overlays
  function buildOverlay() {
    // quest tracker
    const hud = el('div', 'game-hud');
    hud.innerHTML = `<div class="game-hud-title">🎒 Tour Quest</div>` +
      BUILDINGS.map(k => `<div class="game-quest" data-q="${k}"><span class="box">▢</span> ${World.CONTENT[k].name}</div>`).join('');
    wrap.appendChild(hud);

    // interaction hint
    const hint = el('div', 'game-hint');
    hint.style.display = 'none';
    wrap.appendChild(hint);

    // dialog overlay
    const dlg = el('div', 'game-dialog');
    dlg.style.display = 'none';
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });
    wrap.appendChild(dlg);

    // touch controls
    const pad = el('div', 'game-touch');
    pad.innerHTML = `
      <div class="dpad">
        <button data-d="up">▲</button>
        <div class="dpad-mid">
          <button data-d="left">◀</button>
          <button data-d="right">▶</button>
        </div>
        <button data-d="down">▼</button>
      </div>
      <button class="action-btn" data-action="1">E</button>`;
    wrap.appendChild(pad);
    bindTouch(pad);

    // toast
    const toast = el('div', 'game-toast');
    toast.style.display = 'none';
    wrap.appendChild(toast);

    overlay = { hud, hint, dlg, toast };
  }
  let overlay = {};

  function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }

  function bindTouch(pad) {
    const set = (d, v) => { touch[d] = v; };
    pad.querySelectorAll('[data-d]').forEach(btn => {
      const d = btn.dataset.d;
      const on = e => { e.preventDefault(); set(d, true); };
      const off = e => { e.preventDefault(); set(d, false); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    });
    const act = pad.querySelector('[data-action]');
    const fire = e => { e.preventDefault(); if (paused) closeDialog(); else if (activePoi) openDialog(activePoi); };
    act.addEventListener('touchstart', fire, { passive: false });
    act.addEventListener('mousedown', fire);
  }

  function updateHint() {
    if (!overlay.hint) return;
    if (activePoi && !paused) {
      overlay.hint.style.display = 'block';
      overlay.hint.innerHTML = `<b>E</b> / Space — ${activePoi.icon} ${activePoi.name}`;
    } else {
      overlay.hint.style.display = 'none';
    }
  }

  // --------------------------------------------------------------- dialog
  function openDialog(poi) {
    paused = true;
    const c = poi.content;
    const secs = c.sections.map(s =>
      `<div class="dsec"><h3>${s.title}</h3>${s.meta ? `<span class="dmeta">${s.meta}</span>` : ''}<p>${s.text}</p></div>`
    ).join('');
    const external = /^https?:|^mailto:/.test(c.link.href);
    overlay.dlg.innerHTML = `
      <div class="game-dialog-card" role="dialog" aria-modal="true">
        <button class="dclose" aria-label="Close">✕</button>
        <div class="dhead"><span class="dicon">${c.icon}</span><h2>${c.heading}</h2></div>
        <p class="dblurb">${c.blurb}</p>
        <div class="dsections">${secs}</div>
        <a class="dlink" href="${c.link.href}"${external ? ' target="_blank" rel="noopener"' : ''}>${c.link.label}</a>
      </div>`;
    overlay.dlg.style.display = 'flex';
    overlay.dlg.querySelector('.dclose').addEventListener('click', closeDialog);
    keys.clear();

    // quest progress
    if (BUILDINGS.includes(poi.id) && !visited.has(poi.id)) {
      visited.add(poi.id);
      const q = overlay.hud.querySelector(`[data-q="${poi.id}"]`);
      if (q) { q.classList.add('done'); q.querySelector('.box').textContent = '☑'; }
      if (visited.size === BUILDINGS.length) celebrate();
    }
  }

  function closeDialog() {
    paused = false;
    interactLocked = true; // require key release before reopening
    overlay.dlg.style.display = 'none';
  }

  function celebrate() {
    const t = overlay.toast;
    t.innerHTML = `🎉 Tour complete! You explored all of Danna's town. Thanks for visiting!`;
    t.style.display = 'block';
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.style.display = 'none', 600); }, 5000);
  }

  // --------------------------------------------------------------- start
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
