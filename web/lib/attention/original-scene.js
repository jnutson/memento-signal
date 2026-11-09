// Ported from memento-website/demo-src; retain its visual design. The green box is a visual reference, not an eligibility rule.
// 3D scene for the Attention page. Framework-free: the React view owns data/state and drives this via the returned API.
import * as THREE from "three";

const S = 1.6;
const BLUE = 0x0a7aff;

function radialTex(stops, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"),
    gr = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createScene(
  host,
  {
    onHover,
    onSelect,
    onZone,
    zoneInteractive = false,
    thirdAxisLabel = "Urgency",
  } = {},
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0xffffff, 1);
  renderer.domElement.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;";
  host.appendChild(renderer.domElement);
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font-family:var(--font-sans),Inter,-apple-system,sans-serif;";
  host.appendChild(overlay);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 8, 16);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 40);

  // orbit state
  const HOME = {
    yaw: 0.72,
    pitch: 0.34,
    dist: 8.6,
    tgt: new THREE.Vector3(0, -0.15, 0),
  };
  const cam = {
    yaw: HOME.yaw,
    pitch: HOME.pitch,
    dist: HOME.dist,
    tgt: HOME.tgt.clone(),
  };
  const goal = {
    yaw: HOME.yaw,
    pitch: HOME.pitch,
    dist: HOME.dist,
    tgt: HOME.tgt.clone(),
  };
  const vel = { yaw: 0, pitch: 0 };
  let tween = null;
  const ease = (x) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const startTween = (dur = 1.1) => {
    tween = {
      t: 0,
      dur,
      yaw: cam.yaw,
      pitch: cam.pitch,
      dist: cam.dist,
      tgt: cam.tgt.clone(),
    };
  };

  // floor grid
  const gridPts = [];
  const gy = -S + 0.002;
  for (let i = -2; i <= 2; i++) {
    const v = (i / 2) * S;
    if (i > -2) gridPts.push(-S, gy, v, S, gy, v, v, gy, -S, v, gy, S);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gridPts, 3),
  );
  const gridMat = new THREE.LineBasicMaterial({
    color: 0xe3e3e8,
    fog: true,
    transparent: true,
  });
  scene.add(new THREE.LineSegments(gridGeo, gridMat));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2, S * 2),
    new THREE.MeshBasicMaterial({
      color: 0xf7f8fa,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -S - 0.004;
  floor.renderOrder = -10;
  scene.add(floor);

  // axes with arrowheads
  const O = new THREE.Vector3(-S, -S, -S),
    black = new THREE.MeshBasicMaterial({ color: 0x1d1d1f, fog: false });
  const axes = [
    [new THREE.Vector3(1, 0, 0), "Confidence"],
    [new THREE.Vector3(0, 1, 0), "Impact"],
    [new THREE.Vector3(0, 0, 1), thirdAxisLabel],
  ].map(([dir, label]) => {
    const len = S * 2 + 0.25,
      end = O.clone().addScaledVector(dir, len);
    const lg = new THREE.BufferGeometry().setFromPoints([O, end]);
    const ax = new THREE.Line(
      lg,
      new THREE.LineBasicMaterial({ color: 0x1d1d1f, fog: false }),
    );
    scene.add(ax);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 20), black);
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(cone);
    const el = document.createElement("div");
    el.textContent = label;
    el.style.cssText =
      "position:absolute;left:0;top:0;font-size:12px;font-weight:600;color:#1d1d1f;white-space:nowrap;will-change:transform;backface-visibility:hidden;";
    overlay.appendChild(el);
    return { el, end, pos: O.clone().addScaledVector(dir, len + 0.1) };
  });

  // "Important" box: high confidence, high impact, high urgency
  const gMin = new THREE.Vector3(0, 0.2 * S, 0.2 * S),
    gMax = new THREE.Vector3(S, S, S);
  const gSize = gMax.clone().sub(gMin),
    gCtr = gMin.clone().add(gMax).multiplyScalar(0.5);
  const gBox = new THREE.Mesh(
    new THREE.BoxGeometry(gSize.x, gSize.y, gSize.z),
    new THREE.MeshBasicMaterial({
      color: 0x1f9d55,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      fog: true,
    }),
  );
  gBox.position.copy(gCtr);
  gBox.renderOrder = -2;
  scene.add(gBox);
  const gEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(gBox.geometry),
    new THREE.LineBasicMaterial({
      color: 0x1f9d55,
      transparent: true,
      opacity: 0.8,
      fog: true,
    }),
  );
  gEdges.position.copy(gCtr);
  gEdges.renderOrder = -1;
  scene.add(gEdges);
  const gShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(gSize.x, gSize.z),
    new THREE.MeshBasicMaterial({
      color: 0x1f9d55,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    }),
  );
  gShadow.rotation.x = -Math.PI / 2;
  gShadow.position.set(gCtr.x, -S + 0.001, gCtr.z);
  gShadow.renderOrder = -3;
  scene.add(gShadow);

  // drifting dust
  const DUST = 160,
    dPos = new Float32Array(DUST * 3),
    dSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dPos[i * 3] = (Math.random() * 2 - 1) * S;
    dPos[i * 3 + 1] = (Math.random() * 2 - 1) * S;
    dPos[i * 3 + 2] = (Math.random() * 2 - 1) * S;
    dSeed[i] = Math.random() * 10;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  const dustTex = radialTex(
    [
      [0, "rgba(10,122,255,0.9)"],
      [1, "rgba(10,122,255,0)"],
    ],
    32,
  );
  const dust = new THREE.Points(
    dGeo,
    new THREE.PointsMaterial({
      size: 0.035,
      map: dustTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      fog: true,
    }),
  );
  scene.add(dust);

  // shared orb textures
  const haloTex = radialTex([
    [0, "rgba(10,110,240,0.32)"],
    [0.4, "rgba(40,140,255,0.12)"],
    [1, "rgba(90,170,255,0)"],
  ]);
  const coreTex = radialTex([
    [0, "rgba(10,79,176,0.95)"],
    [0.3, "rgba(10,104,230,0.8)"],
    [0.55, "rgba(10,122,255,0.5)"],
    [0.8, "rgba(90,168,255,0.15)"],
    [1, "rgba(130,190,255,0)"],
  ]);
  const heartTex = radialTex([
    [0, "rgba(8,62,150,0.75)"],
    [0.5, "rgba(10,79,176,0.25)"],
    [1, "rgba(10,104,230,0)"],
  ]);
  const haloO = radialTex([
    [0, "rgba(240,120,50,0.34)"],
    [0.4, "rgba(240,130,55,0.12)"],
    [1, "rgba(240,140,60,0)"],
  ]);
  const coreO = radialTex([
    [0, "rgba(224,64,40,0.95)"],
    [0.3, "rgba(232,96,48,0.8)"],
    [0.55, "rgba(240,140,60,0.5)"],
    [0.8, "rgba(246,165,80,0.15)"],
    [1, "rgba(250,180,95,0)"],
  ]);
  const heartO = radialTex([
    [0, "rgba(214,52,34,0.75)"],
    [0.5, "rgba(226,80,44,0.25)"],
    [1, "rgba(232,96,48,0)"],
  ]);
  [haloO, coreO, heartO].forEach(
    (tx) => renderer.initTexture && renderer.initTexture(tx),
  );
  const ORANGE = new THREE.Color(0xf07a32),
    BLUEC = new THREE.Color(BLUE);
  const shadowTex = radialTex([
    [0, "rgba(10,70,160,0.32)"],
    [0.5, "rgba(10,70,160,0.1)"],
    [1, "rgba(10,70,160,0)"],
  ]);
  const ringGeo = new THREE.RingGeometry(0.92, 1, 64);
  const hitGeo = new THREE.SphereGeometry(0.2, 12, 12),
    hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const orbs = new Map();
  const labelEl = document.createElement("div");
  labelEl.style.cssText =
    "position:absolute;left:0;top:0;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:13px;font-weight:600;color:#1d1d1f;white-space:nowrap;opacity:0;transition:opacity .18s;will-change:transform,opacity;backface-visibility:hidden;";
  overlay.appendChild(labelEl);

  let hoverId = null,
    selId = null,
    zone = false,
    zf = 0,
    boxHov = false;
  const inBox = (p) =>
    p.x >= gMin.x - 1e-6 &&
    p.y >= gMin.y - 1e-6 &&
    p.z >= gMin.z - 1e-6 &&
    p.x <= gMax.x + 1e-6 &&
    p.y <= gMax.y + 1e-6 &&
    p.z <= gMax.z + 1e-6;
  const ZONE = { pitch: 0.32, dist: 4.4 };
  const toWorld = (w) => new THREE.Vector3(w[0] * S, w[1] * S, w[2] * S);

  function disposeOrb(orb) {
    const objects = [orb.g, orb.shadow, orb.drop, ...orb.rings];
    for (const object of objects) {
      scene.remove(object);
      object.traverse((child) => {
        if (
          child.geometry &&
          child.geometry !== hitGeo &&
          child.geometry !== ringGeo
        )
          child.geometry.dispose();
        if (child.material && child.material !== hitMat)
          child.material.dispose();
      });
    }
  }

  function setItems(items) {
    const keep = new Set(items.map((i) => i.id));
    for (const [id, o] of orbs)
      if (!keep.has(id)) {
        o.dying = true;
      }
    items.forEach((it, n) => {
      if (orbs.has(it.id)) {
        const o = orbs.get(it.id);
        o.title = it.title;
        o.dying = false;
        return;
      }
      const g = new THREE.Group(),
        base = toWorld(it.w);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTex,
          transparent: true,
          depthWrite: false,
          fog: true,
        }),
      );
      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: coreTex,
          transparent: true,
          depthWrite: false,
          fog: true,
        }),
      );
      const heart = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: heartTex,
          transparent: true,
          depthWrite: false,
          fog: true,
        }),
      );
      const mk = (map) =>
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map,
            transparent: true,
            depthWrite: false,
            fog: true,
            opacity: 0,
          }),
        );
      const haloB = mk(haloO),
        coreB = mk(coreO),
        heartB = mk(heartO);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.id = it.id;
      g.add(halo, core, heart, haloB, coreB, heartB, hit);
      [halo, core, heart, haloB, coreB, heartB].forEach(
        (m) => (m.renderOrder = 2),
      );
      g.position.copy(base);
      scene.add(g);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          fog: true,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(base.x, -S + 0.003, base.z);
      shadow.renderOrder = -4;
      scene.add(shadow);
      const rings = [0, 1].map(() => {
        const r = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: BLUE,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: true,
            side: THREE.DoubleSide,
          }),
        );
        r.rotation.x = -Math.PI / 2;
        r.position.set(base.x, -S + 0.004, base.z);
        r.renderOrder = -4;
        scene.add(r);
        return r;
      });
      const dropGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(base.x, Math.max(-S, base.y - 0.17), base.z),
        new THREE.Vector3(base.x, -S, base.z),
      ]);
      const drop = new THREE.Line(
        dropGeo,
        new THREE.LineDashedMaterial({
          color: BLUE,
          dashSize: 0.04,
          gapSize: 0.05,
          transparent: true,
          opacity: 0.25,
          fog: true,
        }),
      );
      drop.computeLineDistances();
      drop.renderOrder = -4;
      scene.add(drop);
      orbs.set(it.id, {
        g,
        halo,
        core,
        heart,
        haloB,
        coreB,
        heartB,
        mix: 0,
        hit,
        shadow,
        rings,
        drop,
        base,
        inside: inBox(base),
        blur: 0,
        title: it.title,
        phase: n * 1.37,
        s: 0,
        hs: 1,
        life: 0,
        dying: false,
      });
    });
  }

  function focus(id) {
    selId = id;
    const o = id && orbs.get(id);
    if (o) {
      const p = o.base;
      if (zone) {
        goal.tgt.copy(gCtr).lerp(p, 0.5);
        goal.dist = ZONE.dist * 0.85;
      } else {
        goal.tgt.copy(HOME.tgt).lerp(p, 0.35);
        goal.dist = 0;
      }
      goal.yaw =
        cam.yaw +
        (((Math.atan2(p.x, p.z) + 0.35 - cam.yaw + Math.PI * 3) %
          (Math.PI * 2)) -
          Math.PI);
      goal.pitch = 0.32;
      startTween(1.2);
    } else if (zone) {
      goal.tgt.copy(gCtr);
      goal.dist = ZONE.dist;
      goal.pitch = ZONE.pitch;
    } else {
      goal.tgt.copy(HOME.tgt);
      goal.dist = HOME.dist;
    }
    if (!o) startTween(1.1);
    vel.yaw = vel.pitch = 0;
  }
  function setZone(on) {
    if (zone === on) return;
    zone = on;
    selId = null;
    if (on) {
      goal.tgt.copy(gCtr);
      goal.dist = ZONE.dist;
      goal.pitch = ZONE.pitch;
      goal.yaw =
        cam.yaw +
        (((Math.atan2(gCtr.x, gCtr.z) + 0.2 - cam.yaw + Math.PI * 3) %
          (Math.PI * 2)) -
          Math.PI);
    } else {
      goal.tgt.copy(HOME.tgt);
      goal.dist = HOME.dist;
      goal.pitch = HOME.pitch;
    }
    startTween(1.3);
    vel.yaw = vel.pitch = 0;
    onZone?.(on);
  }
  function reset() {
    if (zone) {
      zone = false;
      onZone?.(false);
    }
    selId = null;
    goal.yaw =
      cam.yaw +
      (((HOME.yaw - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    goal.pitch = HOME.pitch;
    goal.dist = HOME.dist;
    goal.tgt.copy(HOME.tgt);
    vel.yaw = vel.pitch = 0;
    startTween(1.3);
  }
  function setHover(id) {
    hoverId = id;
  }

  // input
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(
      [...orbs.values()]
        .filter((o) => !o.dying && (!zone || o.inside))
        .map((o) => o.hit),
      false,
    );
    return hits.length ? hits[0].object.userData.id : null;
  };
  const pickBox = () => ray.intersectObject(gBox, false).length > 0;
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    if (tween) {
      goal.yaw = cam.yaw;
      goal.pitch = cam.pitch;
      tween = null;
    }
    drag = { x: e.clientX, y: e.clientY, moved: false };
    vel.yaw = vel.pitch = 0;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      el.style.cursor = "grabbing";
      drag.x = e.clientX;
      drag.y = e.clientY;
      const ny = -dx * 0.006,
        np = dy * 0.005;
      vel.yaw = vel.yaw * 0.6 + ny * 0.4;
      vel.pitch = vel.pitch * 0.6 + np * 0.4;
      goal.yaw += ny;
      goal.pitch = Math.max(0.12, Math.min(1.35, goal.pitch + np));
      return;
    }
    const id = pick(e);
    if (id !== hoverId) {
      hoverId = id;
      onHover?.(id);
    }
    boxHov = zoneInteractive && !id && !zone && pickBox();
    el.style.cursor = id || boxHov ? "pointer" : "grab";
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.style.cursor = "grab";
    if (d.moved) return;
    const id = pick(e);
    if (id) {
      onSelect?.(id);
      return;
    }
    if (zoneInteractive && !zone && pickBox()) {
      setZone(true);
      onSelect?.(null);
      return;
    }
    if (zone && selId) {
      onSelect?.(null);
      return;
    }
    if (zone) {
      setZone(false);
      return;
    }
    onSelect?.(null);
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", () => {
    if (!drag && hoverId) {
      hoverId = null;
      onHover?.(null);
    }
  });
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (tween) {
        tween = null;
        goal.dist = cam.dist;
      }
      const base = zone ? goal.dist : Math.max(goal.dist, fitDist());
      goal.dist = Math.max(
        zone ? 2.6 : 0,
        Math.min(12, base * Math.exp(e.deltaY * 0.0012)),
      );
    },
    { passive: false },
  );

  // resize
  let W = 1,
    H = 1;
  const ro = new ResizeObserver(() => {
    const nW = host.clientWidth || 1,
      nH = host.clientHeight || 1;
    if (nW === W && nH === H) return;
    W = nW;
    H = nH;
    renderer.setSize(W, H, false);
    axes.forEach((a) => (a.el._w = null));
    labelEl._w = null;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  });
  ro.observe(host);

  const tmp = new THREE.Vector3(),
    lp = new THREE.Vector3();
  const corners = [];
  for (const x of [-S, S + 0.35])
    for (const y of [-S, S + 0.35])
      for (const z of [-S, S + 0.35]) corners.push(new THREE.Vector3(x, y, z));
  const fitDist = () => {
    // smallest distance at which every cube corner (incl. arrow tips) sits inside ~88% of the frame
    const vf = Math.tan((camera.fov * Math.PI) / 360),
      hf = vf * camera.aspect,
      m = 0.88;
    const fwd = new THREE.Vector3(
      Math.cos(cam.pitch) * Math.sin(cam.yaw),
      Math.sin(cam.pitch),
      Math.cos(cam.pitch) * Math.cos(cam.yaw),
    ).negate();
    const right = new THREE.Vector3()
        .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
        .normalize(),
      up = new THREE.Vector3().crossVectors(right, fwd);
    let need = 0;
    for (const c of corners) {
      const v = c.clone().sub(cam.tgt),
        depthOff = v.dot(fwd);
      need = Math.max(
        need,
        Math.abs(v.dot(right)) / (hf * m) - depthOff,
        Math.abs(v.dot(up)) / (vf * m) - depthOff,
      );
    }
    return need;
  };
  const place = (el, v, dx = 0, dy = 0) => {
    tmp.copy(v).project(camera);
    if (el._w == null) {
      el._w = el.offsetWidth;
      el._h = el.offsetHeight;
    }
    const x = ((tmp.x + 1) / 2) * W + dx - el._w / 2,
      y = ((1 - tmp.y) / 2) * H + dy - el._h / 2;
    el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    const vis = tmp.z < 1 ? "visible" : "hidden";
    if (el.style.visibility !== vis) el.style.visibility = vis;
  };

  let last = performance.now(),
    t = 0;
  let raf,
    alive = true;
  const frame = () => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const nowMs = performance.now(),
      dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    t += dt;
    if (!drag && (Math.abs(vel.yaw) > 1e-4 || Math.abs(vel.pitch) > 1e-4)) {
      goal.yaw += vel.yaw;
      goal.pitch = Math.max(0.12, Math.min(1.35, goal.pitch + vel.pitch));
      const decay = Math.pow(0.02, dt);
      vel.yaw *= decay;
      vel.pitch *= decay * 0.9;
    }
    const k = 1 - Math.pow(0.001, dt),
      kr = 1 - Math.pow(drag ? 1e-6 : 0.001, dt);
    const want = Math.max(2, zone ? goal.dist : Math.max(goal.dist, fitDist()));
    if (tween && !drag) {
      tween.t += dt;
      const p = Math.min(1, tween.t / tween.dur),
        e = ease(p);
      cam.yaw = tween.yaw + (goal.yaw - tween.yaw) * e;
      cam.pitch = tween.pitch + (goal.pitch - tween.pitch) * e;
      cam.dist = tween.dist + (want - tween.dist) * e;
      cam.tgt.copy(tween.tgt).lerp(goal.tgt, e);
      if (p >= 1) tween = null;
    } else {
      cam.yaw += (goal.yaw - cam.yaw) * kr;
      cam.pitch += (goal.pitch - cam.pitch) * kr;
      cam.dist += (want - cam.dist) * k;
      cam.tgt.lerp(goal.tgt, k);
    }

    zf += ((zone ? 1 : 0) - zf) * Math.min(1, dt * 4);
    gBox.material.opacity = 0.07 + zf * 0.03 + (boxHov ? 0.05 : 0);
    gEdges.material.opacity = 0.8 + (boxHov ? 0.2 : 0);
    gridMat.opacity = 1 - zf * 0.75;
    dust.material.opacity = 0.45 * (1 - zf);
    axes.forEach((a) => {
      a.el.style.opacity = (1 - zf * 0.7).toFixed(3);
      a.el.style.filter = "";
    });
    camera.position.set(
      cam.tgt.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      cam.tgt.y + cam.dist * Math.sin(cam.pitch),
      cam.tgt.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
    );
    camera.lookAt(cam.tgt);
    scene.fog.near = cam.dist - 1.2;
    scene.fog.far = cam.dist + 7;

    const p = dGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      const s = dSeed[i];
      p[i * 3 + 1] += Math.sin(t * 0.3 + s) * 0.0009 + 0.0006;
      p[i * 3] += Math.cos(t * 0.2 + s * 1.7) * 0.0006;
      if (p[i * 3 + 1] > S) p[i * 3 + 1] = -S;
    }
    dGeo.attributes.position.needsUpdate = true;

    let labelTarget = null;
    for (const [id, o] of orbs) {
      o.life +=
        ((o.dying ? 0 : 1) - o.life) * Math.min(1, dt * (o.dying ? 6 : 2.5));
      if (o.dying && o.life < 0.01) {
        disposeOrb(o);
        orbs.delete(id);
        continue;
      }
      const isSel = id === selId,
        isHov = id === hoverId;
      o.hs += ((isSel ? 1.35 : isHov ? 1.25 : 1) - o.hs) * Math.min(1, dt * 4);
      const bob = Math.sin(t * 0.9 + o.phase) * 0.045,
        breathe = 1 + Math.sin(t * 1.6 + o.phase * 2) * 0.07;
      o.g.position.set(o.base.x, o.base.y + bob, o.base.z);
      o.mix += ((isSel ? 1 : 0) - o.mix) * Math.min(1, dt * 3.2);
      const mx = o.mix * o.mix * (3 - 2 * o.mix);
      o.rings.forEach((r) => r.material.color.copy(BLUEC).lerp(ORANGE, mx));
      o.drop.material.color.copy(BLUEC).lerp(ORANGE, mx);
      o.blur += ((zone && !o.inside ? 1 : 0) - o.blur) * Math.min(1, dt * 5);
      o.g.visible = o.shadow.visible = o.drop.visible = o.blur < 0.99;
      o.rings.forEach((r) => (r.visible = o.blur < 0.99));
      const b = o.blur,
        sc = o.life * o.hs * (1 - b),
        spread = 1,
        dim = 1 - b;
      o.halo.scale.setScalar(
        0.95 * sc * spread * (isSel ? 1.1 + Math.sin(t * 3) * 0.12 : breathe),
      );
      o.core.scale.setScalar(0.42 * sc * breathe);
      o.heart.scale.setScalar(
        0.17 * sc * (1 + Math.sin(t * 2.3 + o.phase) * 0.1),
      );
      o.halo.material.opacity = o.life * (isSel || isHov ? 1 : 0.85) * dim;
      o.core.material.opacity = o.life * (1 - b);
      o.heart.material.opacity = o.life * (1 - b);
      [
        [o.halo, o.haloB],
        [o.core, o.coreB],
        [o.heart, o.heartB],
      ].forEach(([a, c]) => {
        c.scale.copy(a.scale);
        c.material.opacity = a.material.opacity * mx;
        a.material.opacity *= 1 - mx;
      });
      const hgt = (o.base.y + bob + S) / (2 * S);
      o.shadow.scale.setScalar((0.35 + hgt * 0.45) * o.life);
      o.shadow.material.opacity = o.life * (1 - hgt * 0.55) * (1 - b);
      o.drop.material.opacity =
        0.22 * o.life * (isSel || isHov ? 2.2 : 1) * (1 - b);
      o.rings.forEach((r, n) => {
        const speed = isSel ? 0.07 : 0.03,
          ph = (t * speed + o.phase * 0.31 + n * 0.5) % 1;
        r.scale.setScalar(0.06 + ph * (isSel ? 0.55 : 0.32));
        r.material.opacity =
          Math.sin(ph * Math.PI) *
          (1 - ph) *
          o.life *
          (isSel ? 0.5 : isHov ? 0.32 : 0.12) *
          (1 - b);
      });
      if (isSel || (isHov && !labelTarget)) labelTarget = o;
      if (isSel) labelTarget = o;
    }
    axes.forEach((a) => {
      const e = a.end.clone().project(camera),
        o = O.clone().project(camera);
      if (a.el._w == null) {
        a.el._w = a.el.offsetWidth;
        a.el._h = a.el.offsetHeight;
      }
      const ex = ((e.x + 1) / 2) * W,
        ey = ((1 - e.y) / 2) * H,
        ox = ((o.x + 1) / 2) * W,
        oy = ((1 - o.y) / 2) * H;
      let dx = ex - ox,
        dy = ey - oy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const w = a.el._w,
        hh = a.el._h,
        pad = 10;
      // push the label outward from the arrow tip so its nearest edge clears the tip
      let cx = ex + dx * (w / 2 + 8),
        cy = ey + dy * (hh / 2 + 6);
      cx = Math.max(pad + w / 2, Math.min(W - pad - w / 2, cx));
      cy = Math.max(pad + hh / 2, Math.min(H - pad - hh / 2, cy));
      a.el.style.transform = `translate3d(${(cx - w / 2).toFixed(2)}px,${(cy - hh / 2).toFixed(2)}px,0)`;
      const vis = e.z < 1 ? "visible" : "hidden";
      if (a.el.style.visibility !== vis) a.el.style.visibility = vis;
    });
    if (labelTarget) {
      if (labelEl._txt !== labelTarget.title) {
        labelEl.textContent = labelEl._txt = labelTarget.title;
        labelEl._w = null;
      }
      lp.lerp(labelTarget.g.position, labelEl._on ? Math.min(1, dt * 7) : 1);
      place(labelEl, lp, 0, -34);
      if (!labelEl._on) {
        labelEl.style.opacity = "1";
        labelEl._on = true;
      }
    } else if (labelEl._on) {
      labelEl.style.opacity = "0";
      labelEl._on = false;
    }
    renderer.render(scene, camera);
  };
  frame();

  return {
    setItems,
    focus,
    reset,
    setHover,
    setZone,
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
        const m = o.material;
        if (m)
          (Array.isArray(m) ? m : [m]).forEach((x) => {
            x.map?.dispose();
            x.dispose();
          });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      host.innerHTML = "";
    },
  };
}
