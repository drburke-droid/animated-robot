import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5, headTilt: 0 };
const uiCache = { left: {}, right: {} };

const SYSTEM_STATE = {
  nerves: { "R-CN3": 1, "R-CN4": 1, "R-CN6": 1, "L-CN3": 1, "L-CN4": 1, "L-CN6": 1 },
  muscles: { 
    right: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 },
    left: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 }
  }
};

const PATHOLOGIES = {
  "CN III Palsy": { s: ['R', 'L', 'B'], prev: "0.4", desc: "Oculomotor nerve palsy. Causes a 'down-and-out' eye position, ptosis (eyelid droop), and potentially a dilated pupil.", f: (side) => setNerve(side, 3, 0) },
  "CN IV Palsy": { s: ['R', 'L', 'B'], prev: "0.5", desc: "Trochlear nerve palsy affecting the Superior Oblique muscle. Causes vertical double vision and an upward drift (hypertropia).", f: (side) => setNerve(side, 4, 0) },
  "CN VI Palsy": { s: ['R', 'L', 'B'], prev: "1.1", desc: "Abducens nerve palsy. Blocks outward movement (abduction) and causes the eye to drift inward (esotropia).", f: (side) => setNerve(side, 6, 0) },
  "INO (MLF)": { s: ['R', 'L', 'B'], prev: "0.3", desc: "Internuclear Ophthalmoplegia. Damage to the Medial Longitudinal Fasciculus (MLF). The eye on the side of the lesion cannot turn inward (adduct) during horizontal gaze.", f: (side) => {
    if(side==='right'||side==='both') SYSTEM_STATE.muscles.right.MR = 0;
    if(side==='left'||side==='both') SYSTEM_STATE.muscles.left.MR = 0;
  }},
  "Graves (TED)": { s: ['R', 'L', 'B'], prev: "2.5", desc: "Thyroid Eye Disease. An autoimmune swelling of the muscles. Typically restricts the Inferior Rectus and Medial Rectus first.", f: (side) => {
    const t = side === 'both' ? ['right','left'] : [side];
    t.forEach(s => { SYSTEM_STATE.muscles[s].IR = 0.3; SYSTEM_STATE.muscles[s].MR = 0.5; });
  }},
  "Blowout Fx": { s: ['R', 'L'], prev: "0.8", desc: "Orbital floor fracture. The Inferior Rectus muscle becomes physically trapped in the bone, preventing upward gaze.", f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; }},
  "Brown Syn.": { s: ['R', 'L'], prev: "0.2", desc: "Mechanical restriction of the Superior Oblique tendon. Prevents the eye from looking up when it is turned inward toward the nose.", f: (side) => { SYSTEM_STATE.muscles[side].IO = 0; }},
  "Myasthenia": { s: ['B'], prev: "2.0", desc: "Myasthenia Gravis. An autoimmune breakdown of communication between nerves and muscles. Characterized by fluctuating fatigue and weakness.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.4); }},
  "Parinaud": { s: ['B'], prev: "0.1", desc: "Dorsal Midbrain Syndrome. Often caused by pineal gland tumors. Prevents upward gaze and causes convergence-retraction nystagmus.", f: () => { ['right','left'].forEach(s => { SYSTEM_STATE.muscles[s].SR = 0; SYSTEM_STATE.muscles[s].IO = 0; }); }},
  "Miller Fisher": { s: ['B'], prev: "0.05", desc: "A rare variant of Guillain-Barré Syndrome (GBS). Causes acute, symmetrical paralysis of all eye movements and loss of reflexes.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.1); }},
  "Wallenberg": { s: ['R', 'L'], prev: "0.2", desc: "Lateral Medullary Syndrome (PICA Artery stroke). Causes skew deviation (one eye sits higher), Horner's syndrome, and balance loss.", f: (side) => { 
    const isR = side === 'right';
    SYSTEM_STATE.muscles[isR?'right':'left'].IR = 0.5; 
    SYSTEM_STATE.muscles[isR?'left':'right'].SR = 0.5; 
  }},
  "AICA Stroke": { s: ['R', 'L'], prev: "0.1", desc: "Anterior Inferior Cerebellar Artery stroke. Often involves the CN VI nucleus and CN VII (facial) nerve, causing total gaze palsy to one side.", f: (side) => { setNerve(side, 6, 0); }},
  "Foville Syn.": { s: ['R', 'L'], prev: "0.05", desc: "Brainstem lesion (Pons). Causes a combination of CN VI palsy, CN VII palsy (facial droop), and a loss of all horizontal gaze toward the lesion.", f: (side) => { setNerve(side, 6, 0); setNerve(side, 3, 0.5); }},
  "Weber Syn.": { s: ['R', 'L'], prev: "0.1", desc: "Midbrain stroke. Causes a CN III palsy on the side of the stroke and weakness on the opposite side of the body.", f: (side) => { setNerve(side, 3, 0); }},
  "Bielschowsky": { s: ['R', 'L'], prev: "0.5", desc: "Clinical sign of a CN IV (Trochlear) palsy. The upward drift of the eye worsens when the head is tilted toward the side of the palsy.", f: (side) => { setNerve(side, 4, 0); }},
  "One-and-a-Half": { s: ['R', 'L'], prev: "0.1", desc: "Complex brainstem lesion. One eye is completely fixed horizontally; the other eye can only move outward (abduct).", f: (side) => {
    const isR = side === 'right';
    setNerve(side, 6, 0);
    SYSTEM_STATE.muscles.right.MR = 0;
    SYSTEM_STATE.muscles.left.MR = 0;
  }}
};

let activePathName = null;
const tooltip = document.getElementById('tooltip');

function setNerve(side, num, val) {
  if(side === 'both') { SYSTEM_STATE.nerves['R-CN'+num] = val; SYSTEM_STATE.nerves['L-CN'+num] = val; }
  else { SYSTEM_STATE.nerves[(side==='right'?'R':'L')+'-CN'+num] = val; }
}

window.resetSystem = () => {
  Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 1);
  ['right','left'].forEach(s => MUSCLES.forEach(m => SYSTEM_STATE.muscles[s][m] = 1));
  updateUIStyles();
};

window.toggleState = (id, side = null, m = null) => {
  let cur = m ? SYSTEM_STATE.muscles[side][m] : SYSTEM_STATE.nerves[id];
  let next = cur === 1 ? 0.5 : (cur === 0.5 ? 0 : 1);
  if (m) SYSTEM_STATE.muscles[side][m] = next; else SYSTEM_STATE.nerves[id] = next;
  updateUIStyles();
};

window.closeModal = () => document.getElementById('side-modal').style.display = 'none';

window.applyPathology = (side) => {
  resetSystem();
  PATHOLOGIES[activePathName].f(side);
  updateUIStyles();
  closeModal();
};

function updateUIStyles() {
  Object.entries(SYSTEM_STATE.nerves).forEach(([id, v]) => {
    const el = document.getElementById(id); if(!el) return;
    el.className = 'pill clickable' + (v === 0.5 ? ' paresis' : (v === 0 ? ' paralysis' : ''));
  });
  ['left','right'].forEach(s => {
    const sideKey = s === 'left' ? 'L' : 'R';
    MUSCLES.forEach(m => {
      const v = SYSTEM_STATE.muscles[s][m];
      const el = document.querySelector(`#muscles${sideKey} .m-label-${m}`);
      if(el) el.className = `m-label clickable m-label-${m}` + (v===0.5?' paresis':(v===0?' paralysis':''));
    });
  });
}

function initUI() {
  const sides = [{ id: "musclesR", key: "right", label: "Right Eye (OD)" }, { id: "musclesL", key: "left", label: "Left Eye (OS)" }];
  sides.forEach(s => {
    const el = document.getElementById(s.id);
    if(!el) return;
    el.innerHTML = `<div style="color:#4cc9f0; font-size:12px; font-weight:900; margin-bottom:10px;">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = `<div class="m-label clickable m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });

  const grid = document.getElementById('pathology-grid');
  if(!grid) return;
  Object.keys(PATHOLOGIES).forEach(name => {
    const btn = document.createElement('div'); btn.className = 'pill clickable'; btn.innerText = name;
    btn.onmouseover = (e) => {
      const p = PATHOLOGIES[name];
      tooltip.innerHTML = `<div class="tt-title">${name}</div><div class="tt-stat">Prev: ~${p.prev}/10k patients</div><div>${p.desc}</div>`;
      tooltip.style.display = 'block';
      tooltip.style.left = e.pageX + 10 + 'px'; tooltip.style.top = e.pageY + 10 + 'px';
    };
    btn.onmouseout = () => tooltip.style.display = 'none';
    btn.onclick = () => {
      activePathName = name;
      document.getElementById('side-modal').style.display = 'flex';
      ['R','B','L'].forEach(c => {
        const sideBtn = document.getElementById('btn-side-'+c);
        if(sideBtn) sideBtn.style.display = PATHOLOGIES[name].s.includes(c)?'block':'none';
      });
    };
    grid.appendChild(btn);
  });
  const hud = document.getElementById("hud-container");
  if(hud) hud.style.opacity = "1";
  const tilt = document.getElementById("tiltSlider");
  if(tilt) tilt.oninput = (e) => APP_STATE.headTilt = THREE.MathUtils.degToRad(e.target.value);
}

function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  const h = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  // Basal Tone & Drift: Unopposed SO and LR pull Down and Out in CN3 Palsy
  const driftX = (1 - h.LR) * -0.4 + (1 - h.MR) * 0.4;
  const driftY = (1 - h.SR) * -0.1 + (1 - h.IR) * 0.1 + (h.SR === 0 && h.IR === 0 ? -0.25 : 0);

  let allowedYaw = isRight ? 
    (targetYaw < 0 ? targetYaw * h.LR : targetYaw * h.MR) :
    (targetYaw > 0 ? targetYaw * h.LR : targetYaw * h.MR);

  const nasalYaw = isRight ? targetYaw : -targetYaw;
  const nasalFactor = THREE.MathUtils.clamp((nasalYaw + 0.5) / 1.0, 0, 1);

  let allowedPitch;
  if (targetPitch > 0) {
     allowedPitch = nasalFactor > 0.5 ? targetPitch * h.IO : targetPitch * h.SR;
  } else {
     allowedPitch = nasalFactor > 0.5 ? targetPitch * h.SO : targetPitch * h.IR;
  }

  const finalYaw = allowedYaw + (isRight ? -driftX : driftX);
  const finalPitch = allowedPitch + driftY;

  const abd = isRight ? -finalYaw : finalYaw;
  const add = -abd;

  return {
    rotation: { y: finalYaw, x: finalPitch },
    acts: {
      LR: (0.2 + Math.max(0, abd) * 1.8) * h.LR,
      MR: (0.2 + Math.max(0, add) * 1.8) * h.MR,
      SR: (0.2 + Math.max(0, finalPitch) * 2.2 * (1 - nasalFactor)) * h.SR,
      IR: (0.2 + Math.max(0, -finalPitch) * 1.8 * (1 - nasalFactor)) * h.IR,
      IO: (0.2 + Math.max(0, finalPitch) * 2.0 * nasalFactor) * h.IO,
      SO: (0.2 + Math.max(0, -finalPitch) * 1.8 * nasalFactor + (h.IR === 0 ? 0.3 : 0)) * h.SO
    }
  };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.z = 6.5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("app").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0, 0.5));
const penlight = new THREE.PointLight(0xffffff, 80, 10);
scene.add(penlight);

const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  const m = { x: (e.clientX/window.innerWidth)*2-1, y: -(e.clientY/window.innerHeight)*2+1 };
  const r = new THREE.Raycaster(); r.setFromCamera(m, camera);
  r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), -2.5), targetVec);
  APP_STATE.hasPointer = true;
});

// Initialization fix for loading screens
window.addEventListener("load", () => {
  initUI();
});

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene; model.position.y = -1.6;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.traverse(o => {
    if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o;
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0 });
  });
  scene.add(model);
  const loader = document.getElementById("loading");
  if(loader) loader.style.display = "none";
  APP_STATE.ready = true;
  animate();
});

function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  if (APP_STATE.hasPointer) penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6);
  if (model) model.rotation.z = APP_STATE.headTilt;

  [ {mesh: eyeL, isR: false, s: "left"}, {mesh: eyeR, isR: true, s: "right"} ].forEach(i => {
    if (!i.mesh) return;
    const eyePos = new THREE.Vector3();
    i.mesh.getWorldPosition(eyePos);
    const yaw = Math.atan2(targetVec.x - eyePos.x, targetVec.z - eyePos.z);
    const pitch = Math.atan2(targetVec.y - eyePos.y, targetVec.z - eyePos.z);
    const res = getRecruitment(i.isR, yaw, pitch);
    i.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ');

    MUSCLES.forEach(m => {
      const cache = uiCache[i.s][m];
      const valRaw = res.acts[m];
      const valDisplay = Math.min(100, Math.round((valRaw / 0.7) * 100));
      cache.bar.style.width = valDisplay + "%";
      cache.pct.innerText = valDisplay + "%";
      cache.bar.style.background = valRaw < 0.05 ? "#ff4d6d" : (valRaw < 0.25 ? "#ffb703" : "#4cc9f0");
    });
  });
  renderer.render(scene, camera);
}
