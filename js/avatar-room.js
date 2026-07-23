/* Low-poly 3D "typing at my desk" diorama for the homepage hero.
   Uses the global THREE (r121) already loaded for the Vanta background.
   Honors prefers-reduced-motion and syncs typing bursts with the
   headline typewriter via .sync-ready / .is-typing on the container. */
(function () {
  var container = document.getElementById('avatar-room');
  if (!container) return;

  var POSTER = 'resources/images/coding-character-poster.png';
  var DESK_MODEL = 'resources/models/adjustable-desk.glb';
  var KEYBOARD_MODEL = 'resources/models/mechanical-keyboard.glb';
  var MONITOR_MODEL = 'resources/models/curved_gaming_monitor.glb';
  var PC_MODEL = 'resources/models/pc_gamer_animation.glb';
  var CHAIR_MODEL = 'resources/models/Office Chair.glb';
  var MACBOOK_MODEL = 'resources/models/macbook_pro_m3_16_inch_2024.glb';
  var SMISKI_MODEL = 'resources/models/smiski_cat.glb';
  var COFFEE_MODEL = 'resources/models/coffe_cafe.glb';
  var MOUSE_MODEL = 'resources/models/razer_basilisk_v3.glb';

  function fallbackImage() {
    var img = document.createElement('img');
    img.src = POSTER;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    container.appendChild(img);
    container.dataset.animating = 'false';
  }

  if (typeof THREE === 'undefined') { fallbackImage(); return; }

  var C = {
    platform: 0x151924,
    rug: 0x1b202c,
    desk: 0x2a2f3d,
    deskLeg: 0x1c202b,
    bezel: 0x1a1e28,
    screen: 0x0d1018,
    keyboard: 0x232836,
    key: 0x2e3442,
    chair: 0x191d28,
    chairDark: 0x11141c,
    skin: 0xeab68f,
    hair: 0x201d28,
    shirt: 0x262c3a,
    jeans: 0x313952,
    shoe: 0x191c26,
    headphones: 0x2e323e,
    accent: 0xf18845,
    cream: 0xf8f4ed,
    codeDim: 0x6b7690,
    plant: 0x4e7d63,
    pot: 0x2a2e3a
  };

  var scene, camera, renderer, root;
  var animated = [];       // per-frame update callbacks
  var mixers = [];         // THREE.AnimationMixer instances from GLB clips
  var rafId = null;
  var clock = new THREE.Clock();
  var elapsed = 0;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var HOME_Y = -0.52; // resting heading: three-quarter view, profile + screens
  var KEYBOARD_TARGET = {
    width: 0.6,
    height: 0.075,
    depth: 0.5,
    bottomY: 0.823,
    centerX: 0,
    centerZ: -0.45
  };
  // curved gaming monitor: sits on the desk, screen faces the character (+Z)
  var MONITOR_TARGET = { height: 0.68, centerX: 0, bottomY: 0.823, centerZ: -0.85, rotY: Math.PI / 2 };
  // gaming PC tower: on the desk to the right, glass panel angled to camera
  var PC_TARGET = { height: 0.6, centerX: 1.4, bottomY: 0.823, centerZ: -0.5, rotY: -.05 };
  // nudge the character + chair + rug toward the keyboard (−Z, the way she
  // faces) so her hands land on the keys; nothing else moves
  var SEAT_FORWARD = -0.13;
  // office chair: replaces the procedural chair the character sits in
  var CHAIR_TARGET = { height: 1.18, centerX: 0, bottomY: 0.02, centerZ: 0.33 + SEAT_FORWARD, rotY: Math.PI };
  // secondary MacBook, open on the left of the desk, screen angled to camera
  var MACBOOK_TARGET = { height: 0.24, centerX: -0.72, bottomY: 0.823, centerZ: -0.52, rotY: 4 + Math.PI };
  // Smiski cat figurine perched on the desk, front-left; animated idle
  var SMISKI_TARGET = { height: 0.8, centerX: -1.4, bottomY: 0.7, centerZ: -0.85, rotY: 0  };
  // coffee (replaces the procedural mug); has a baked animation
  var COFFEE_TARGET = { height: 0.14, centerX: 0.74, bottomY: 0.823, centerZ: -0.37, rotY: 0 };
  // Razer mouse (replaces the procedural mouse), on the mousepad
  var MOUSE_TARGET = { height: 0.042, centerX: 0.42, bottomY: 0.822, centerZ: -0.45, rotY: Math.PI };
  // drag-to-spin state (Resend-cube style: momentum, then ease back home)
  var drag = { active: false, lastX: 0, lastY: 0, velY: 0, rotY: 0, rotX: 0, idleAt: 0 };

  function mat(color, opts) {
    var m = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.92, metalness: 0.0, flatShading: true
    });
    if (opts) Object.assign(m, opts);
    return m;
  }

  function add(parent, geo, color, x, y, z, opts) {
    var m = new THREE.Mesh(geo, (color && color.isMaterial) ? color : mat(color, opts));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function box(w, h, d) { return new THREE.BoxBufferGeometry(w, h, d); }
  function cyl(rt, rb, h, seg) { return new THREE.CylinderBufferGeometry(rt, rb, h, seg || 10); }
  function sph(r, seg) { return new THREE.SphereBufferGeometry(r, seg || 10, seg || 10); }

  // smooth-shaded material for the character (furniture stays faceted)
  function smat(color, rough, opts) {
    var m = new THREE.MeshStandardMaterial({
      color: color, roughness: rough == null ? 0.6 : rough, metalness: 0
    });
    if (opts) Object.assign(m, opts);
    return m;
  }

  // smooth tapered cylinder connecting two points (limbs)
  function limb(parent, a, b, r1, r2, material, seg) {
    var av = new THREE.Vector3().fromArray(a);
    var bv = new THREE.Vector3().fromArray(b);
    var dir = new THREE.Vector3().subVectors(bv, av);
    var m = add(parent, cyl(r2 == null ? r1 : r2, r1, dir.length(), seg || 16), material, 0, 0, 0);
    m.position.copy(av).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return m;
  }

  // wavy hair strand: tube along a curve with a rounded tip
  function hairStrand(parent, pts, r, material) {
    var curve = new THREE.CatmullRomCurve3(pts.map(function (p) {
      return new THREE.Vector3().fromArray(p);
    }));
    add(parent, new THREE.TubeBufferGeometry(curve, 20, r, 10, false), material, 0, 0, 0);
    var end = pts[pts.length - 1];
    add(parent, sph(r, 12), material, end[0], end[1], end[2]);
  }

  // discrete keystroke pattern: pressed while cycle fraction is inside an interval
  function pressed(t, cycle, intervals) {
    var f = (t % cycle) / cycle;
    for (var i = 0; i < intervals.length; i++) {
      if (f >= intervals[i][0] && f < intervals[i][1]) return 1;
    }
    return 0;
  }

  function buildMonitor(parent, w, h, x, rotY, lines, withCursor) {
    var g = new THREE.Group();
    g.position.set(x, 0.78, -0.72);
    g.rotation.y = rotY;
    parent.add(g);

    add(g, box(0.05, 0.16, 0.05), C.deskLeg, 0, 0.08, 0);
    add(g, box(0.3, 0.02, 0.16), C.deskLeg, 0, 0.01, 0);
    var head = new THREE.Group();
    head.position.set(0, 0.18 + h / 2, 0);
    g.add(head);
    add(head, box(w, h, 0.045), mat(C.bezel, { roughness: 0.35, metalness: 0.3 }), 0, 0, 0);
    var screenMat = new THREE.MeshBasicMaterial({ color: C.screen });
    add(head, new THREE.PlaneBufferGeometry(w - 0.05, h - 0.05), screenMat, 0, 0, 0.026);

    var lineGeo = new THREE.PlaneBufferGeometry(1, 0.028);
    lineGeo.translate(0.5, 0, 0); // scale from the left edge
    var mats = {
      cream: new THREE.MeshBasicMaterial({ color: C.cream }),
      orange: new THREE.MeshBasicMaterial({ color: C.accent }),
      dim: new THREE.MeshBasicMaterial({ color: C.codeDim })
    };
    mats.cream.color.multiplyScalar(0.85);
    mats.dim.color.multiplyScalar(0.6);

    var top = h / 2 - 0.085, left = -w / 2 + 0.05;
    var live = null;
    lines.forEach(function (L, i) {
      var line = new THREE.Mesh(lineGeo, mats[L[2]]);
      line.position.set(left + L[0], top - i * 0.062, 0.028);
      line.scale.x = L[1];
      head.add(line);
      if (L[3] === 'live') live = { mesh: line, width: L[1] };
    });

    if (live) {
      animated.push(function (t) {
        var f = (t % 3.9) / 3.9; // grows in steps, holds, starts a new line
        var k = Math.min(f, 0.58) / 0.58;
        live.mesh.scale.x = live.width * Math.max(0.08, Math.ceil(k * 6) / 6);
      });
    }
    if (withCursor) {
      var cur = new THREE.Mesh(new THREE.PlaneBufferGeometry(0.03, 0.04), mats.orange);
      cur.position.set(left + 0.02, top - lines.length * 0.062, 0.028);
      head.add(cur);
      animated.push(function (t) { cur.visible = (t % 1.06) < 0.53; });
    }
    return g;
  }

  function buildFallbackDesk(parent) {
    add(parent, box(2.5, 0.07, 0.85), mat(C.desk, { roughness: 0.45, metalness: 0.2 }), 0, 0.78, -0.55);
    [-1, 1].forEach(function (s) {
      add(parent, box(0.07, 0.78, 0.6), C.deskLeg, s * 1.12, 0.39, -0.55);
    });
  }

  function buildModelDesk(parent) {
    if (!THREE.GLTFLoader) {
      buildFallbackDesk(parent);
      return;
    }

    var loader = new THREE.GLTFLoader();
    loader.load(DESK_MODEL, function (gltf) {
      var desk = gltf.scene;
      var bounds = new THREE.Box3().setFromObject(desk);
      var size = new THREE.Vector3();
      var center = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);

      var scale = new THREE.Vector3(
        1 / size.x,
        0.78 / size.y,
        3.3 / size.z
      );
      var deskGroup = new THREE.Group();
      deskGroup.position.set(0, 0.82, -0.5);
      deskGroup.rotation.y = Math.PI * 1.5;
      desk.scale.copy(scale);
      desk.position.set(
        -center.x * scale.x,
        -bounds.max.y * scale.y,
        -center.z * scale.z
      );

      desk.traverse(function (node) {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          node.material.roughness = Math.max(node.material.roughness || 0, 0.45);
        }
      });

      deskGroup.add(desk);
      parent.add(deskGroup);
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    }, undefined, function () {
      buildFallbackDesk(parent);
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    });
  }

  function buildFallbackKeyboard(parent) {
    add(parent, box(0.52, 0.03, 0.19), C.keyboard, 0, 0.8, -0.3);
    var keyGeo = box(0.035, 0.016, 0.035);
    var keyMat = mat(C.key);
    var accentKeyMat = mat(C.accent);
    for (var r = 0; r < 3; r++) {
      for (var k = 0; k < 10; k++) {
        add(parent, keyGeo, (r === 0 && k === 0) ? accentKeyMat : keyMat,
          -0.21 + k * 0.047, 0.822, -0.35 + r * 0.05);
      }
    }
  }

  function buildModelKeyboard(parent) {
    if (!THREE.GLTFLoader) {
      buildFallbackKeyboard(parent);
      return;
    }

    var loader = new THREE.GLTFLoader();
    loader.load(KEYBOARD_MODEL, function (gltf) {
      var keyboard = gltf.scene;
      // the GLB is baked in a diagonal product-shot pose; rotate it flat
      // first (rows map model width->X, top->Y, front edge->+Z), otherwise
      // the axis-aligned fit below squashes it into a tilted slab
      keyboard.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
        -0.5551, 0.2093, -0.8050, 0,
        0.2606, -0.8753, -0.4073, 0,
        -0.7899, -0.4359, 0.4314, 0,
        0, 0, 0, 1
      ));

      var keyboardGroup = new THREE.Group();
      keyboardGroup.add(keyboard);
      keyboardGroup.updateMatrixWorld(true);
      var bounds = new THREE.Box3().setFromObject(keyboardGroup);
      var size = new THREE.Vector3();
      bounds.getSize(size);

      keyboardGroup.scale.set(
        KEYBOARD_TARGET.width / size.x,
        KEYBOARD_TARGET.height / size.y,
        KEYBOARD_TARGET.depth / size.z
      );
      keyboardGroup.updateMatrixWorld(true);

      var placedBounds = new THREE.Box3().setFromObject(keyboardGroup);
      var placedCenter = new THREE.Vector3();
      placedBounds.getCenter(placedCenter);
      keyboardGroup.position.set(
        KEYBOARD_TARGET.centerX - placedCenter.x,
        KEYBOARD_TARGET.bottomY - placedBounds.min.y,
        KEYBOARD_TARGET.centerZ - placedCenter.z
      );

      keyboard.traverse(function (node) {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          node.material.roughness = Math.max(node.material.roughness || 0, 0.35);
        }
      });

      parent.add(keyboardGroup);
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    }, undefined, function () {
      buildFallbackKeyboard(parent);
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    });
  }

  // Orient (optional Y-spin), uniformly scale to a target height, then drop the
  // model so its footprint centre / bottom land at (centerX, bottomY, centerZ).
  // Uniform scaling keeps model proportions (unlike the keyboard's box fit).
  function placeModel(obj, target, minRough, onMesh) {
    if (target.rotY) obj.rotation.y = target.rotY;
    var group = new THREE.Group();
    group.add(obj);
    group.updateMatrixWorld(true);
    var bounds = new THREE.Box3().setFromObject(group);
    var size = new THREE.Vector3();
    bounds.getSize(size);
    group.scale.setScalar(target.height / size.y);
    group.updateMatrixWorld(true);

    var placed = new THREE.Box3().setFromObject(group);
    var center = new THREE.Vector3();
    placed.getCenter(center);
    group.position.set(
      target.centerX - center.x,
      target.bottomY - placed.min.y,
      target.centerZ - center.z
    );

    obj.traverse(function (node) {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material && minRough != null) {
        node.material.roughness = Math.max(node.material.roughness || 0, minRough);
      }
      if (onMesh) onMesh(node);
    });
    return group;
  }

  function loadModel(url, target, minRough, parent, onFail, onMesh, clipIndices) {
    if (!THREE.GLTFLoader) { if (onFail) onFail(); return; }
    var loader = new THREE.GLTFLoader();
    loader.load(url, function (gltf) {
      parent.add(placeModel(gltf.scene, target, minRough, onMesh));
      // play baked clips (fans, figurine idle, steam), looping. clipIndices
      // limits to specific clips when some would fight over the same bones.
      if (gltf.animations && gltf.animations.length) {
        var mixer = new THREE.AnimationMixer(gltf.scene);
        var clips = clipIndices
          ? clipIndices.map(function (i) { return gltf.animations[i]; })
          : gltf.animations;
        clips.forEach(function (clip) { if (clip) mixer.clipAction(clip).play(); });
        mixers.push(mixer);
      }
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    }, undefined, function () {
      if (onFail) onFail();
      if (rafId === null && renderer && scene && camera) renderer.render(scene, camera);
    });
  }

  // Animated "code editor" drawn to a canvas, returned as a texture that
  // self-types line by line and loops. Used as the curved monitor's screen.
  function makeCodeScreen() {
    var canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 460;
    var ctx = canvas.getContext('2d');
    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    var COL = {
      bg: '#0c1119', gutter: '#38415c', caret: '#f18845',
      def: '#d6dae8', kw: '#f18845', str: '#86b58f', com: '#6b7690', fn: '#e6c07b'
    };
    // each line is a list of [text, colorKey] tokens
    var CODE = [
      [['const ', 'kw'], ['me', 'def'], [' = ', 'def'], ['{', 'def']],
      [['  name: ', 'def'], ["'danna'", 'str'], [',', 'def']],
      [['  role: ', 'def'], ["'creative dev'", 'str'], [',', 'def']],
      [['};', 'def']],
      [['', 'def']],
      [['function ', 'kw'], ['build', 'fn'], ['(portfolio) {', 'def']],
      [['  // ship something fun ✦', 'com']],
      [['  return ', 'kw'], ['portfolio', 'def'], ['.', 'def'], ['render', 'fn'], ['();', 'def']],
      [['}', 'def']],
      [['', 'def']],
      [['await ', 'kw'], ['build', 'fn'], ['(', 'def'], ['me', 'def'], [');', 'def']]
    ];
    var lens = CODE.map(function (line) {
      return line.reduce(function (a, t) { return a + t[0].length; }, 0);
    });
    var total = lens.reduce(function (a, b) { return a + b; }, 0);

    var padX = 60, padTop = 46, lineH = 34, fontPx = 24;
    var cps = 26, cycle = total + 70; // chars, + tail hold before looping

    function draw(shown, caretOn) {
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontPx + "px Menlo, Consolas, 'DejaVu Sans Mono', monospace";
      ctx.textBaseline = 'middle';

      var before = 0, caretX = padX, caretY = padTop;
      for (var li = 0; li < CODE.length; li++) {
        var y = padTop + li * lineH;
        ctx.fillStyle = COL.gutter;
        ctx.fillText(String(li + 1), 20, y);

        var lineShown = Math.max(0, Math.min(shown - before, lens[li]));
        var x = padX, drawn = 0;
        for (var ti = 0; ti < CODE[li].length && drawn < lineShown; ti++) {
          var txt = CODE[li][ti][0];
          var vis = (lineShown - drawn) < txt.length ? txt.slice(0, lineShown - drawn) : txt;
          ctx.fillStyle = COL[CODE[li][ti][1]];
          ctx.fillText(vis, x, y);
          x += ctx.measureText(vis).width;
          drawn += vis.length;
        }
        // caret rides the line currently being typed
        if (shown >= before && shown <= before + lens[li]) { caretX = x; caretY = y; }
        before += lens[li];
      }
      if (caretOn) {
        ctx.fillStyle = COL.caret;
        ctx.fillRect(caretX + 2, caretY - fontPx / 2, 11, fontPx);
      }
      tex.needsUpdate = true;
    }

    var lastShown = -1, lastCaret = null;
    draw(0, true);
    return {
      texture: tex,
      update: function (t) {
        var pos = (t * cps) % cycle;
        var shown = Math.min(Math.floor(pos), total);
        var caretOn = (t % 1) < 0.55;
        if (shown !== lastShown || caretOn !== lastCaret) {
          draw(shown, caretOn);
          lastShown = shown; lastCaret = caretOn;
        }
      }
    };
  }

  function buildProceduralMonitors(parent) {
    buildMonitor(parent, 0.95, 0.58, -0.42, 0.2, [
      [0, 0.32, 'orange'], [0.07, 0.55, 'cream'], [0.07, 0.42, 'dim'],
      [0.14, 0.6, 'cream'], [0.14, 0.34, 'orange'], [0.07, 0.48, 'dim'],
      [0, 0.62, 'orange', 'live']
    ], false);
    buildMonitor(parent, 0.72, 0.46, 0.52, -0.22, [
      [0, 0.38, 'cream'], [0, 0.52, 'dim'], [0, 0.44, 'dim'], [0, 0.55, 'cream']
    ], true);
  }

  function buildFallbackChair(parent) {
    add(parent, cyl(0.3, 0.34, 0.09, 14), C.chair, 0, 0.58, 0.3);
    var back = add(parent, box(0.36, 0.52, 0.07), C.chair, 0, 1.0, 0.63);
    back.rotation.x = -0.12;
    add(parent, cyl(0.035, 0.035, 0.42, 8), C.chairDark, 0, 0.36, 0.3);
    for (var i = 0; i < 4; i++) {
      var legA = i * Math.PI / 2 + Math.PI / 4;
      var leg = add(parent, box(0.34, 0.035, 0.06), C.chairDark, Math.cos(legA) * 0.17, 0.12, 0.3 + Math.sin(legA) * 0.17);
      leg.rotation.y = -legA;
      add(parent, sph(0.045, 8), C.chairDark, Math.cos(legA) * 0.32, 0.07, 0.3 + Math.sin(legA) * 0.32);
    }
  }

  function buildCharacter(parent) {
    var g = new THREE.Group(); // faces -Z (toward the monitors)
    parent.add(g);

    var skinM = smat(0xf0b78f, 0.55);
    var hairM = smat(0x242031, 0.5);
    var shirtM = smat(0x262c3a, 0.75);
    var jeansM = smat(0x8e939e, 0.8);
    var goldM = smat(0xe5b56b, 0.35, { metalness: 0.7 });

    // legs: light-gray jeans + chunky black boots
    [-1, 1].forEach(function (s) {
      limb(g, [s * 0.11, 0.68, 0.3], [s * 0.125, 0.7, -0.04], 0.09, 0.075, jeansM);
      add(g, sph(0.075, 18), jeansM, s * 0.125, 0.7, -0.04);
      limb(g, [s * 0.125, 0.7, -0.04], [s * 0.125, 0.17, -0.1], 0.07, 0.052, jeansM);
      add(g, box(0.105, 0.1, 0.23), smat(0x101116, 0.4), s * 0.125, 0.085, -0.15);
      add(g, box(0.12, 0.04, 0.27), smat(0x07080b, 0.5), s * 0.125, 0.022, -0.16);
    });
    var hips = add(g, sph(0.2, 20), jeansM, 0, 0.68, 0.27);
    hips.scale.set(1.15, 0.7, 1);

    // torso breathes; arms stay anchored to the keyboard
    var torso = new THREE.Group();
    g.add(torso);
    var body = add(torso, cyl(0.175, 0.235, 0.5, 20), shirtM, 0, 1.03, 0.24);
    body.rotation.x = 0.06;
    var chest = add(torso, sph(0.205, 22), shirtM, 0, 1.28, 0.22);
    chest.scale.set(1, 0.8, 0.92);
    [-1, 1].forEach(function (s) { // camp collar
      var c = add(torso, box(0.09, 0.028, 0.06), smat(0x2e3547, 0.75), s * 0.055, 1.38, 0.15);
      c.rotation.set(-0.5, s * 0.35, s * 0.5);
    });
    for (var b = 0; b < 4; b++) { // buttons
      add(torso, sph(0.011, 10), smat(0xd8d2c6, 0.5), 0, 1.3 - b * 0.09, 0.052 + b * 0.012);
    }
    // gold chain + crescent moon pendant
    var chain = add(torso, new THREE.TorusBufferGeometry(0.078, 0.006, 8, 24), goldM, 0, 1.37, 0.19);
    chain.rotation.x = Math.PI / 2.25;
    var moon = add(torso, sph(0.016, 12), goldM, 0, 1.3, 0.055);
    moon.scale.set(1, 1, 0.4);
    add(torso, cyl(0.05, 0.06, 0.14, 14), skinM, 0, 1.44, 0.2); // neck

    // head
    var headG = new THREE.Group();
    headG.position.set(0, 1.56, 0.19);
    torso.add(headG);
    var skull = add(headG, sph(0.21, 28), skinM, 0, 0, 0);
    skull.scale.set(0.95, 1.02, 0.98);
    add(headG, sph(0.018, 12), skinM, 0, -0.03, -0.208); // nose
    // soft closed smile: bottom arc of a thin torus
    var smile = add(headG, new THREE.TorusBufferGeometry(0.03, 0.0075, 8, 20, Math.PI * 0.55),
      smat(0xb96f66, 0.55), 0, -0.082, -0.198);
    smile.rotation.z = Math.PI * 1.225;
    smile.scale.z = 0.5;
    add(headG, sph(0.007, 10), smat(0x3a2c22, 0.6), 0.108, -0.05, -0.168); // beauty mark
    [-1, 1].forEach(function (s) { // blush
      var bl = add(headG, sph(0.032, 14),
        new THREE.MeshBasicMaterial({ color: 0xe08d72, transparent: true, opacity: 0.22 }),
        s * 0.115, -0.055, -0.158);
      bl.scale.set(1.2, 0.7, 0.5);
      bl.castShadow = false;
    });
    var browM = smat(0x241c15, 0.6);
    [-1, 1].forEach(function (s) { // brows
      var br = add(headG, sph(0.042, 14), browM, s * 0.085, 0.08, -0.178);
      br.scale.set(1.35, 0.22, 0.35);
      br.rotation.z = s * 0.18;
    });
    // eyes: sclera + iris + catchlight + lash line; blink scales the group
    var eyes = [];
    var scleraM = smat(0xf4efe7, 0.35);
    var irisM = smat(0x33231a, 0.3);
    var lashM = smat(0x1c1510, 0.6);
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Group();
      eye.position.set(s * 0.082, 0.012, -0.178);
      headG.add(eye);
      var sc = add(eye, sph(0.034, 18), scleraM, 0, 0, 0);
      sc.scale.set(1, 1.05, 0.55);
      var ir = add(eye, sph(0.02, 16), irisM, 0, -0.002, -0.02);
      ir.scale.set(1, 1.15, 0.6);
      var hl = add(eye, sph(0.006, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }),
        s * 0.006, 0.008, -0.031);
      hl.castShadow = false;
      var lash = add(eye, sph(0.037, 16), lashM, 0, 0.017, -0.003);
      lash.scale.set(1.06, 0.34, 0.56);
      eyes.push(eye);
    });

    // hair: cap + curtain bangs + wavy strands (tubes) + back volume
    var cap = add(headG, sph(0.235, 28), hairM, 0, 0.05, 0.06);
    cap.scale.set(1, 0.95, 0.98);
    [-1, 1].forEach(function (s) {
      var bang = add(headG, sph(0.11, 18), hairM, s * 0.115, 0.14, -0.115);
      bang.scale.set(0.55, 0.95, 0.5);
      bang.rotation.z = s * 0.55;
      hairStrand(headG, [
        [s * 0.16, 0.14, -0.09],
        [s * 0.225, -0.05, -0.05],
        [s * 0.19, -0.24, -0.02],
        [s * 0.235, -0.42, 0.02]
      ], 0.05, hairM);
      hairStrand(headG, [
        [s * 0.2, 0.06, 0.02],
        [s * 0.25, -0.15, 0.05],
        [s * 0.21, -0.35, 0.1],
        [s * 0.24, -0.52, 0.12]
      ], 0.04, hairM);
      hairStrand(headG, [
        [s * 0.1, -0.2, 0.19],
        [s * 0.16, -0.38, 0.2],
        [s * 0.12, -0.55, 0.22]
      ], 0.055, hairM);
    });
    var backHair = add(headG, sph(0.2, 24), hairM, 0, -0.16, 0.15);
    backHair.scale.set(1.08, 1.5, 0.8);
    hairStrand(headG, [[0, -0.25, 0.21], [0.04, -0.45, 0.23], [-0.02, -0.6, 0.24]], 0.06, hairM);

    // headphones over the hair
    var hpM = smat(0x2e323e, 0.45);
    add(headG, new THREE.TorusBufferGeometry(0.262, 0.03, 10, 24, Math.PI), hpM, 0, 0.03, 0.02);
    [-1, 1].forEach(function (s) {
      var cup = add(headG, cyl(0.095, 0.095, 0.07, 18), hpM, s * 0.252, -0.01, 0.01);
      cup.rotation.z = Math.PI / 2;
      var pad = add(headG, cyl(0.075, 0.075, 0.085, 18), smat(0x1a1c24, 0.7), s * 0.243, -0.01, 0.01);
      pad.rotation.z = Math.PI / 2;
      add(headG, cyl(0.032, 0.032, 0.075, 14), smat(C.accent, 0.4), s * 0.262, -0.01, 0.01)
        .rotation.z = Math.PI / 2;
    });

    // arms: static upper arm, elbow pivot for typing
    var elbows = [];
    [-1, 1].forEach(function (s) {
      var S = [s * 0.235, 1.27, 0.23], E = [s * 0.3, 0.97, 0.06];
      limb(g, S, [s * 0.27, 1.13, 0.14], 0.093, 0.075, shirtM); // puffed short sleeve
      limb(g, [s * 0.265, 1.16, 0.15], E, 0.052, 0.046, skinM);
      add(g, sph(0.048, 16), skinM, E[0], E[1], E[2]);
      var pivot = new THREE.Group();
      pivot.position.fromArray(E);
      g.add(pivot);
      var W = [s * 0.14 - E[0], 0.84 - E[1], -0.28 - E[2]]; // wrist, elbow-local
      limb(pivot, [0, 0, 0], W, 0.044, 0.036, skinM);
      var hand = add(pivot, sph(0.06, 16), skinM, W[0], W[1], W[2]);
      hand.scale.set(0.95, 0.55, 1.3);
      var thumb = add(pivot, sph(0.022, 12), skinM, W[0] - s * 0.045, W[1], W[2] + 0.02);
      thumb.scale.set(1, 0.7, 1.4);
      if (s === -1) { // watch on her left wrist
        var watch = add(pivot, cyl(0.052, 0.052, 0.03, 14), smat(0x1a1d24, 0.4),
          W[0] * 0.86, W[1] * 0.86 + 0.008, W[2] * 0.86);
        watch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(W[0], W[1], W[2]).normalize());
      } else { // ring on her right hand
        var ring = add(pivot, new THREE.TorusBufferGeometry(0.016, 0.005, 8, 16), goldM,
          W[0] + s * 0.02, W[1] + 0.02, W[2] - 0.02);
        ring.rotation.x = Math.PI / 2;
      }
      elbows.push(pivot);
    });

    // animation: typing bursts (irregular, different cycles per hand),
    // breathing, glancing between monitors, blinking
    var nearPat = [[0.04, 0.08], [0.12, 0.16], [0.21, 0.25], [0.29, 0.33], [0.37, 0.41],
                   [0.58, 0.62], [0.67, 0.71], [0.75, 0.79], [0.84, 0.88]];
    var farPat = [[0.05, 0.09], [0.13, 0.17], [0.22, 0.26],
                  [0.44, 0.48], [0.52, 0.56], [0.61, 0.65], [0.69, 0.73], [0.78, 0.82]];
    animated.push(function (t, typing) {
      var near = typing ? pressed(t, 2.7, nearPat) : 0;
      var far = typing ? pressed(t, 3.3, farPat) : 0;
      elbows[1].rotation.x += ((near * 0.13) - elbows[1].rotation.x) * 0.55;
      elbows[0].rotation.x += ((far * 0.13) - elbows[0].rotation.x) * 0.55;

      torso.position.y = Math.sin(t * Math.PI * 2 / 4.6) * 0.012;
      headG.rotation.x = Math.sin(t * Math.PI * 2 / 5.7) * 0.03;
      headG.rotation.y = Math.sin(t * Math.PI * 2 / 9.5) * 0.14; // glance between screens

      var bf = (t % 4.3) / 4.3; // blink
      var closed = (bf > 0.93 && bf < 0.97) ? 0.12 : 1;
      eyes.forEach(function (e) { e.scale.y += (closed - e.scale.y) * 0.6; });
    });
    return g;
  }

  function buildScene() {
    scene = new THREE.Scene();
    root = new THREE.Group();
    scene.add(root);

    // floating platform (Vanta waves show around it through the frame)
    add(root, box(3.6, 0.16, 2.55), mat(0x0e1119, { roughness: 0.6, metalness: 0.05 }), 0, -0.08, -0.1);
    add(root, cyl(0.85, 0.85, 0.015, 24), C.rug, 0, 0.008, 0.35 + SEAT_FORWARD).receiveShadow = true;

    // desk
    buildModelDesk(root);

    // curved gaming monitor (falls back to the animated code screens).
    // drive its screen with a self-typing code editor rendered to a canvas;
    // the emissiveMap makes it glow its own content in the dark room.
    loadModel(MONITOR_MODEL, MONITOR_TARGET, null, root, function () {
      buildProceduralMonitors(root);
    }, function (node) {
      if (node.material && node.material.name === 'screen') {
        var codeScreen = makeCodeScreen();
        node.material.emissive.setHex(0xffffff);
        node.material.emissiveMap = codeScreen.texture;
        node.material.emissiveIntensity = 1;
        node.material.map = codeScreen.texture;
        node.material.color.setHex(0x000000);
        node.material.needsUpdate = true;
        animated.push(function (t) { codeScreen.update(t); });
      }
    });

    // gaming PC tower on the floor beside the desk
    loadModel(PC_MODEL, PC_TARGET, 0.3, root);

    // office chair (falls back to the low-poly chair)
    loadModel(CHAIR_MODEL, CHAIR_TARGET, 0.55, root, function () {
      buildFallbackChair(root);
    });

    // keyboard
    buildModelKeyboard(root);

    // mousepad + Razer mouse (replaces the low-poly mouse); pad stays centred
    // under the mouse by reusing the mouse's target position
    add(root, box(0.22, 0.008, 0.17), mat(0x161923), MOUSE_TARGET.centerX, 0.818, MOUSE_TARGET.centerZ);
    loadModel(MOUSE_MODEL, MOUSE_TARGET, 0.4, root);

    // coffee (replaces the mug + procedural steam); plays its baked animation
    loadModel(COFFEE_MODEL, COFFEE_TARGET, 0.5, root);

    // open MacBook on the left of the desk
    loadModel(MACBOOK_MODEL, MACBOOK_TARGET, 0.4, root);

    // Smiski cat figurine, animated idle (clip 2 fights clip 1's bones, skip it)
    loadModel(SMISKI_MODEL, SMISKI_TARGET, 0.6, root, null, null, [0, 1]);

    // desk plant (sits beside the Smiski)
    add(root, cyl(0.045, 0.035, 0.07, 8), C.pot, -1.4, 0.85, -0.6);
    add(root, sph(0.05, 7), C.plant, -1.4, 0.93, -0.6);
    add(root, sph(0.038, 7), C.plant, -1.35, 0.96, -0.58);
    add(root, sph(0.032, 7), C.plant, -1.44, 0.97, -0.62);

    buildCharacter(root).position.z = SEAT_FORWARD;

    // lights: dim, warm key + orange rim; the screens carry the mood
    scene.add(new THREE.HemisphereLight(0xd8dcf0, 0x05070c, 0.14));
    var key = new THREE.DirectionalLight(0xffe8d0, 0.42);
    key.position.set(2.6, 3.6, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.6; key.shadow.camera.right = 2.6;
    key.shadow.camera.top = 2.6; key.shadow.camera.bottom = -2.6;
    key.shadow.bias = -0.002;
    scene.add(key);
    var rim = new THREE.DirectionalLight(C.accent, 0.8);
    rim.position.set(-2.4, 1.6, -2.2);
    scene.add(rim);
    var glow = new THREE.PointLight(0xffe9cf, 0.75, 2.6);
    glow.position.set(0, 1.25, -0.42);
    scene.add(glow);
    animated.push(function (t) {
      glow.intensity = 0.72 + Math.sin(t * Math.PI * 2 / 3.8) * 0.14;
    });

    camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 30);
    camera.position.set(2.8, 2.35, 3.65);
    camera.lookAt(0, 0.9, -0.15);
  }

  var BASE_FOV = 34, BASE_ASPECT = 16 / 9;
  function resize() {
    var w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrower than 16:9: widen the FOV so the scene fits by width
    if (camera.aspect < BASE_ASPECT) {
      var baseTan = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(baseTan * BASE_ASPECT / camera.aspect));
    } else {
      camera.fov = BASE_FOV;
    }
    camera.updateProjectionMatrix();
    if (rafId === null) renderer.render(scene, camera);
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    var typing = !container.classList.contains('sync-ready') ||
      container.classList.contains('is-typing');
    for (var i = 0; i < animated.length; i++) animated[i](elapsed, typing);
    for (var mi = 0; mi < mixers.length; mi++) mixers[mi].update(dt);

    if (!drag.active) {
      drag.rotY += drag.velY;
      drag.velY *= 0.94; // momentum decay
      if (elapsed - drag.idleAt > 2.5 && Math.abs(drag.velY) < 0.002) {
        // ease back to the home heading (shortest way around)
        drag.rotY -= Math.round(drag.rotY / (Math.PI * 2)) * Math.PI * 2;
        drag.rotY *= 0.97;
        drag.rotX *= 0.95;
      }
    }
    root.rotation.y = HOME_Y + drag.rotY + Math.sin(elapsed * Math.PI * 2 / 14) * 0.05;
    root.rotation.x = drag.rotX;
    root.position.y = Math.sin(elapsed * Math.PI * 2 / 5.6) * 0.03; // float
    renderer.render(scene, camera);
  }

  function setMotion() {
    if (motionQuery.matches) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      drag.rotY = 0; drag.rotX = 0; drag.velY = 0;
      root.rotation.set(0, HOME_Y, 0);
      root.position.y = 0;
      container.dataset.animating = 'false';
      renderer.render(scene, camera); // static resting pose
    } else if (rafId === null) {
      container.dataset.animating = 'true';
      clock.getDelta();
      frame();
    }
  }

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    fallbackImage();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  buildScene();

  var el = renderer.domElement;
  el.style.touchAction = 'pan-y'; // horizontal drag spins; vertical still scrolls
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', function (e) {
    if (motionQuery.matches) return;
    drag.active = true;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.velY = 0;
    el.style.cursor = 'grabbing';
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', function (e) {
    if (!drag.active) return;
    var dx = e.clientX - drag.lastX;
    var dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.rotY += dx * 0.006;
    drag.velY = dx * 0.006;
    drag.rotX = Math.max(-0.15, Math.min(0.5, drag.rotX + dy * 0.003));
  });
  function endDrag() {
    if (!drag.active) return;
    drag.active = false;
    drag.idleAt = elapsed;
    el.style.cursor = 'grab';
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(container);
  } else {
    window.addEventListener('resize', resize);
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', setMotion);
  else if (motionQuery.addListener) motionQuery.addListener(setMotion);

  resize();
  setMotion();
})();
