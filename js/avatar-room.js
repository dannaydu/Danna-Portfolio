/* Low-poly 3D "typing at my desk" diorama for the homepage hero.
   Uses the global THREE (r121) already loaded for the Vanta background.
   Honors prefers-reduced-motion and syncs typing bursts with the
   headline typewriter via .sync-ready / .is-typing on the container. */
(function () {
  var container = document.getElementById('avatar-room');
  if (!container) return;

  var POSTER = 'resources/images/coding-character-poster.png';

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
  var rafId = null;
  var clock = new THREE.Clock();
  var elapsed = 0;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var HOME_Y = -0.52; // resting heading: three-quarter view, profile + screens
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

  function buildCharacter(parent) {
    var g = new THREE.Group(); // faces -Z (toward the monitors)
    parent.add(g);

    // chair
    add(g, cyl(0.3, 0.34, 0.09, 14), C.chair, 0, 0.58, 0.3);
    var back = add(g, box(0.36, 0.52, 0.07), C.chair, 0, 1.0, 0.63);
    back.rotation.x = -0.12;
    add(g, cyl(0.035, 0.035, 0.42, 8), C.chairDark, 0, 0.36, 0.3);
    for (var i = 0; i < 4; i++) {
      var legA = i * Math.PI / 2 + Math.PI / 4;
      var leg = add(g, box(0.34, 0.035, 0.06), C.chairDark, Math.cos(legA) * 0.17, 0.12, 0.3 + Math.sin(legA) * 0.17);
      leg.rotation.y = -legA;
      add(g, sph(0.045, 8), C.chairDark, Math.cos(legA) * 0.32, 0.07, 0.3 + Math.sin(legA) * 0.32);
    }

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
    add(root, cyl(0.85, 0.85, 0.015, 24), C.rug, 0, 0.008, 0.35).receiveShadow = true;

    // desk
    add(root, box(2.5, 0.07, 0.85), mat(C.desk, { roughness: 0.45, metalness: 0.2 }), 0, 0.78, -0.55);
    [-1, 1].forEach(function (s) {
      add(root, box(0.07, 0.78, 0.6), C.deskLeg, s * 1.12, 0.39, -0.55);
    });

    buildMonitor(root, 0.95, 0.58, -0.42, 0.2, [
      [0, 0.32, 'orange'],
      [0.07, 0.55, 'cream'],
      [0.07, 0.42, 'dim'],
      [0.14, 0.6, 'cream'],
      [0.14, 0.34, 'orange'],
      [0.07, 0.48, 'dim'],
      [0, 0.62, 'orange', 'live']
    ], false);
    buildMonitor(root, 0.72, 0.46, 0.52, -0.22, [
      [0, 0.38, 'cream'],
      [0, 0.52, 'dim'],
      [0, 0.44, 'dim'],
      [0, 0.55, 'cream']
    ], true);

    // keyboard + keys (one accent keycap, like the inspo)
    add(root, box(0.52, 0.03, 0.19), C.keyboard, 0, 0.8, -0.3);
    var keyGeo = box(0.035, 0.016, 0.035);
    var keyMat = mat(C.key);
    var accentKeyMat = mat(C.accent);
    for (var r = 0; r < 3; r++) {
      for (var k = 0; k < 10; k++) {
        add(root, keyGeo, (r === 0 && k === 0) ? accentKeyMat : keyMat,
          -0.21 + k * 0.047, 0.822, -0.35 + r * 0.05);
      }
    }

    // mousepad + mouse
    add(root, box(0.22, 0.008, 0.17), mat(0x161923), 0.42, 0.818, -0.3);
    var mouse = add(root, sph(0.045, 18), smat(0x232734, 0.4), 0.42, 0.845, -0.29);
    mouse.scale.set(0.75, 0.5, 1.15);

    // mug + steam
    add(root, cyl(0.055, 0.05, 0.12, 12), C.accent, 0.72, 0.845, -0.35);
    add(root, new THREE.TorusBufferGeometry(0.035, 0.011, 6, 12), C.accent, 0.78, 0.85, -0.35)
      .rotation.y = 0; // handle
    var steamMats = [];
    for (var sIdx = 0; sIdx < 3; sIdx++) {
      var sm = new THREE.MeshBasicMaterial({ color: C.cream, transparent: true, opacity: 0 });
      var puff = add(root, sph(0.02 + sIdx * 0.006, 6), sm, 0.72, 0.95, -0.35);
      puff.castShadow = false;
      steamMats.push({ m: sm, mesh: puff, phase: sIdx / 3 });
    }
    animated.push(function (t) {
      steamMats.forEach(function (s) {
        var p = ((t / 5.2) + s.phase) % 1;
        s.mesh.position.y = 0.93 + p * 0.28;
        s.mesh.position.x = 0.72 + Math.sin(p * Math.PI * 2) * 0.015;
        s.m.opacity = Math.sin(p * Math.PI) * 0.38;
      });
    });

    // desk plant
    add(root, cyl(0.045, 0.035, 0.07, 8), C.pot, -1.05, 0.85, -0.65);
    add(root, sph(0.05, 7), C.plant, -1.05, 0.93, -0.65);
    add(root, sph(0.038, 7), C.plant, -1.0, 0.96, -0.63);
    add(root, sph(0.032, 7), C.plant, -1.09, 0.97, -0.67);

    buildCharacter(root);

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
