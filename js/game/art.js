/* ============================================================================
 * art.js — Procedural pixel-art generator
 * ----------------------------------------------------------------------------
 * Every sprite in the game is drawn here, in code, onto small offscreen
 * canvases at native pixel resolution. The renderer scales them up with
 * image smoothing OFF, so they stay crisp and "pixel-y".
 *
 * Nothing here is downloaded or copyrighted — it's all generated, which makes
 * it free to use and easy to swap. To use a real art pack later, you only need
 * to replace the canvases these functions return with images from an atlas.
 * ==========================================================================*/

const TILE = 16; // native tile size in pixels (rendered scaled up)

const Art = (() => {
  // ---- palette -----------------------------------------------------------
  const C = {
    grass1: '#6fae5b', grass2: '#5d9c4d', grass3: '#7ec06a', grassDark: '#4d8a40',
    dirt1: '#caa56e', dirt2: '#b8915c', dirt3: '#d9b884',
    water1: '#54a8e0', water2: '#73bdec', water3: '#3f93cf', foam: '#cdeafb',
    wood: '#8a5a36', woodDark: '#6e4527', leaf1: '#3f8f4f', leaf2: '#4fa55e', leaf3: '#2f7a40',
    flowerR: '#e8657a', flowerY: '#f4d35e', flowerW: '#f6f3ee', flowerP: '#b58bd6',
    stone: '#9aa3ad', stoneDark: '#7c858f', stoneLt: '#bcc4cc',
    outline: '#33291f', shadow: 'rgba(0,0,0,0.18)',
    skin: '#f3c89a', skinDark: '#dca877', hair: '#5a3a26', hairLt: '#6f4a31',
    shirt: '#e07a5f', shirtDark: '#c5654c', pants: '#3d5a80', pantsDark: '#2f4663',
    shoe: '#3a2a2a', eye: '#2a2320',
  };

  // ---- helpers -----------------------------------------------------------
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // tiny seeded RNG so generated textures are stable between reloads
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  // draw a pixel-art bitmap from rows of chars mapped through a palette object.
  // '.' / ' ' = transparent.
  function bmp(rows, pal) {
    const h = rows.length, w = rows[0].length;
    const c = mk(w, h), x = c.getContext('2d');
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const ch = rows[j][i];
        if (ch === '.' || ch === ' ') continue;
        const col = pal[ch];
        if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
      }
    }
    return c;
  }

  // ---- ground tiles ------------------------------------------------------
  function grassTile(seed, withFlower) {
    const c = mk(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = C.grass1; x.fillRect(0, 0, TILE, TILE);
    const r = rng(seed);
    for (let i = 0; i < 26; i++) {
      const px = (r() * TILE) | 0, py = (r() * TILE) | 0, t = r();
      x.fillStyle = t < 0.5 ? C.grass2 : (t < 0.8 ? C.grass3 : C.grassDark);
      x.fillRect(px, py, 1, 1);
      if (t > 0.9) x.fillRect(px, py - 1, 1, 1); // a blade
    }
    if (withFlower) {
      const fx = 4 + ((r() * 8) | 0), fy = 4 + ((r() * 8) | 0);
      const cols = [C.flowerR, C.flowerY, C.flowerW, C.flowerP];
      const col = cols[(r() * cols.length) | 0];
      x.fillStyle = col;
      x.fillRect(fx, fy - 1, 1, 1); x.fillRect(fx - 1, fy, 1, 1);
      x.fillRect(fx + 1, fy, 1, 1); x.fillRect(fx, fy + 1, 1, 1);
      x.fillStyle = C.flowerY; x.fillRect(fx, fy, 1, 1);
    }
    return c;
  }

  function pathTile(seed) {
    const c = mk(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = C.dirt1; x.fillRect(0, 0, TILE, TILE);
    const r = rng(seed);
    for (let i = 0; i < 30; i++) {
      const px = (r() * TILE) | 0, py = (r() * TILE) | 0, t = r();
      x.fillStyle = t < 0.5 ? C.dirt2 : C.dirt3;
      x.fillRect(px, py, 1, 1);
      if (t > 0.92) { x.fillStyle = C.stoneDark; x.fillRect(px, py, 2, 1); } // pebble
    }
    return c;
  }

  function waterTile(seed, frame) {
    const c = mk(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = C.water1; x.fillRect(0, 0, TILE, TILE);
    const r = rng(seed + frame * 97);
    for (let i = 0; i < 8; i++) {
      const px = (r() * TILE) | 0, py = (r() * TILE) | 0;
      x.fillStyle = r() < 0.5 ? C.water2 : C.water3;
      x.fillRect(px, py, 2, 1);
    }
    // gentle ripple highlight that shifts with frame
    x.fillStyle = C.foam;
    const ry = (frame * 3) % TILE;
    x.fillRect(2, ry, 3, 1); x.fillRect(9, (ry + 6) % TILE, 2, 1);
    return c;
  }

  function sandTile() {
    const c = mk(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = C.dirt3; x.fillRect(0, 0, TILE, TILE);
    const r = rng(7);
    for (let i = 0; i < 14; i++) { x.fillStyle = C.dirt1; x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, 1, 1); }
    return c;
  }

  // ---- decorative objects (drawn taller than a tile where noted) ---------
  function tree() {
    const pal = {
      o: C.outline, t: C.wood, T: C.woodDark,
      a: C.leaf1, b: C.leaf2, c: C.leaf3,
    };
    // 16 wide x 24 tall; trunk at bottom, round canopy on top
    return bmp([
      '......aaaa......',
      '....aabbbbaa....',
      '...abbbbbbbba...',
      '..abbbccbbbba...',
      '..abbbbbbbbbba..',
      '.abbbccbbbcbbba.',
      '.abbbbbbbbbbbba.',
      '.acbbbbbbbbbbca.',
      '.abbbbccbbbbbba.',
      '..abbbbbbbbbba..',
      '..acbbbbbbbcba..',
      '...abbbbbbbba...',
      '....aabbbbaa....',
      '......aTTa......',
      '......oTto......',
      '......oTto......',
      '......oTto......',
      '......oTto......',
      '.....oTTTto.....',
      '....ooTTTToo....',
      '...............',
      '...............',
      '...............',
      '...............',
    ], pal);
  }

  function bush() {
    const pal = { a: C.leaf1, b: C.leaf2, c: C.leaf3, r: C.flowerR, y: C.flowerY };
    return bmp([
      '................',
      '....aabbaa......',
      '..aabbbbbbaa....',
      '.abbbccbbbbba..',
      '.abbbbbbrbbba..',
      '.abbycbbbbbba..',
      '..abbbbbbbba...',
      '...aabbbbaa....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], pal);
  }

  function flowerPatch(seed) {
    const c = mk(TILE, TILE), x = c.getContext('2d');
    const r = rng(seed);
    const cols = [C.flowerR, C.flowerY, C.flowerW, C.flowerP];
    for (let i = 0; i < 4; i++) {
      const fx = 2 + ((r() * 12) | 0), fy = 4 + ((r() * 10) | 0);
      const col = cols[(r() * cols.length) | 0];
      x.fillStyle = C.leaf3; x.fillRect(fx, fy + 1, 1, 2);
      x.fillStyle = col;
      x.fillRect(fx, fy - 1, 1, 1); x.fillRect(fx - 1, fy, 1, 1);
      x.fillRect(fx + 1, fy, 1, 1); x.fillRect(fx, fy + 1, 1, 1);
      x.fillStyle = C.flowerY; x.fillRect(fx, fy, 1, 1);
    }
    return c;
  }

  function fence() {
    const pal = { o: C.woodDark, w: C.wood };
    return bmp([
      '................',
      '..o.........o...',
      '.owo.......owo..',
      '.owo.......owo..',
      'ooooooooooooooo.',
      '.owo.......owo..',
      '.owo.......owo..',
      'ooooooooooooooo.',
      '.owo.......owo..',
      '.owo.......owo..',
      '..o.........o...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], pal);
  }

  // a wooden signpost with a blank board (label drawn at runtime over it)
  function sign() {
    const pal = { o: C.outline, w: C.wood, W: C.woodDark, b: '#e9d3a8', B: '#d8bd88' };
    return bmp([
      '................',
      '..obbbbbbbbbo...',
      '.obBBBBBBBBBbo..',
      '.obbbbbbbbbbbo..',
      '.obBBBBBBBBBbo..',
      '.obbbbbbbbbbbo..',
      '..obbbbbbbbbo...',
      '......oWo.......',
      '......oWo.......',
      '......oWo.......',
      '......oWo.......',
      '.....ooWoo......',
      '................',
      '................',
      '................',
      '................',
    ], pal);
  }

  function lamp(frame) {
    const lit = frame % 2 === 0 ? '#ffe9a8' : '#ffdf86';
    const pal = { o: C.outline, m: '#444', l: lit, g: '#fff4c8' };
    return bmp([
      '.....ooo....',
      '....ogggo...',
      '....olllo...',
      '....olllo...',
      '....ogggo...',
      '.....omo....',
      '.....omo....',
      '.....omo....',
      '.....omo....',
      '.....omo....',
      '....ooooo...',
      '............',
    ], pal);
  }

  // ---- buildings ---------------------------------------------------------
  // A cozy cabin, 64x64 native, with a customizable roof colour + an emoji
  // icon and label baked above the door at runtime. Door is centred at bottom.
  function building(roof, roofDark) {
    const c = mk(64, 64), x = c.getContext('2d');
    const W = C.wood, WD = C.woodDark, O = C.outline;
    // walls
    x.fillStyle = '#e9d8bd'; x.fillRect(8, 26, 48, 34);
    x.fillStyle = '#dcc6a3'; // plank shading
    for (let y = 26; y < 60; y += 6) x.fillRect(8, y, 48, 1);
    x.strokeStyle = O; x.lineWidth = 1;
    x.strokeRect(8.5, 26.5, 47, 33);
    // roof (triangle)
    x.fillStyle = roof;
    for (let row = 0; row < 22; row++) {
      const half = Math.round((row / 22) * 30);
      x.fillRect(32 - half, 4 + row, half * 2, 1);
    }
    x.fillStyle = roofDark; // roof shading rows
    for (let row = 0; row < 22; row += 4) {
      const half = Math.round((row / 22) * 30);
      x.fillRect(32 - half, 4 + row, half * 2, 1);
    }
    // roof outline
    x.strokeStyle = O;
    x.beginPath(); x.moveTo(32, 4); x.lineTo(2, 26); x.lineTo(62, 26); x.closePath(); x.stroke();
    // door
    x.fillStyle = WD; x.fillRect(26, 44, 12, 16);
    x.fillStyle = W; x.fillRect(27, 45, 10, 14);
    x.fillStyle = '#f4d35e'; x.fillRect(35, 52, 1, 1); // knob
    x.strokeStyle = O; x.strokeRect(26.5, 44.5, 11, 15);
    // windows
    x.fillStyle = '#9fd6f0'; x.fillRect(14, 34, 9, 9); x.fillRect(41, 34, 9, 9);
    x.strokeStyle = O; x.strokeRect(14.5, 34.5, 8, 8); x.strokeRect(41.5, 34.5, 8, 8);
    x.strokeStyle = WD; x.beginPath();
    x.moveTo(18.5, 34); x.lineTo(18.5, 43); x.moveTo(14, 38.5); x.lineTo(23, 38.5);
    x.moveTo(45.5, 34); x.lineTo(45.5, 43); x.moveTo(41, 38.5); x.lineTo(50, 38.5);
    x.stroke();
    // little chimney
    x.fillStyle = C.stoneDark; x.fillRect(44, 8, 6, 10);
    x.strokeStyle = O; x.strokeRect(44.5, 8.5, 5, 9);
    return c;
  }

  // ---- character sprite sheet -------------------------------------------
  // 16x24 frames. Returns { down:[f0,f1], up:[...], left:[...], right:[...] }.
  // f0 = idle/contact, f1 = mid-stride (legs swapped). We build right, then
  // mirror for left.
  function charFrame(dir, frame) {
    const c = mk(16, 24), x = c.getContext('2d');
    const O = C.outline, S = C.skin, SD = C.skinDark, H = C.hair, HL = C.hairLt;
    const SH = C.shirt, SHD = C.shirtDark, P = C.pants, SHo = C.shoe, E = C.eye;

    // soft shadow
    x.fillStyle = C.shadow; x.beginPath();
    x.ellipse(8, 22, 5, 1.6, 0, 0, Math.PI * 2); x.fill();

    // legs (frame animates them)
    const swing = frame === 1 ? 1 : 0;
    x.fillStyle = P;
    x.fillRect(5, 17, 2, 3 + (swing ? 1 : 0)); // left leg
    x.fillRect(9, 17, 2, 3 + (swing ? 0 : 1)); // right leg
    x.fillStyle = SHo; // shoes
    x.fillRect(5, 20 + (swing ? 1 : 0), 3, 2);
    x.fillRect(9, 20 + (swing ? 0 : 1), 3, 2);

    // body / shirt
    x.fillStyle = SH; x.fillRect(4, 11, 8, 6);
    x.fillStyle = SHD; x.fillRect(4, 15, 8, 2); // shaded hem
    x.fillStyle = O; x.strokeStyle = O;
    // arms
    x.fillStyle = S; x.fillRect(3, 12, 1, 4); x.fillRect(12, 12, 1, 4);

    // head
    x.fillStyle = S; x.fillRect(4, 4, 8, 8);
    x.fillStyle = SD; x.fillRect(4, 11, 8, 1); // chin shade

    // hair + face by direction
    if (dir === 'up') {
      // back of head: all hair, no face
      x.fillStyle = H; x.fillRect(3, 3, 10, 8);
      x.fillStyle = HL; x.fillRect(3, 3, 10, 2);
    } else if (dir === 'down') {
      x.fillStyle = H; x.fillRect(3, 3, 10, 4); // fringe
      x.fillStyle = HL; x.fillRect(3, 3, 10, 1);
      x.fillStyle = H; x.fillRect(3, 4, 1, 6); x.fillRect(12, 4, 1, 6); // side hair
      x.fillStyle = E; x.fillRect(6, 8, 1, 1); x.fillRect(9, 8, 1, 1); // eyes
      x.fillStyle = SD; x.fillRect(7, 9, 2, 1); // smile-ish nose/mouth
    } else { // right (and mirrored for left)
      x.fillStyle = H; x.fillRect(3, 3, 9, 4);
      x.fillStyle = HL; x.fillRect(3, 3, 9, 1);
      x.fillStyle = H; x.fillRect(3, 4, 1, 6); // back side hair
      x.fillStyle = E; x.fillRect(9, 8, 1, 1); // one eye facing right
    }

    // light outline around the head only (keeps the face readable without
    // making the body look boxy)
    x.strokeStyle = O; x.lineWidth = 1;
    x.strokeRect(3.5, 3.5, 9, 8);
    return c;
  }

  function characterSheet() {
    const dirs = ['down', 'up', 'right'];
    const sheet = {};
    dirs.forEach(d => { sheet[d] = [charFrame(d, 0), charFrame(d, 1)]; });
    // left = mirrored right
    sheet.left = sheet.right.map(src => {
      const c = mk(16, 24), x = c.getContext('2d');
      x.translate(16, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
      return c;
    });
    return sheet;
  }

  return {
    TILE, palette: C,
    grassTile, pathTile, waterTile, sandTile,
    tree, bush, flowerPatch, fence, sign, lamp,
    building, characterSheet,
  };
})();
