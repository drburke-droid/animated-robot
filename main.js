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
  "CN III Palsy": { s: ['R', 'L', 'B'], prev: "0.4", desc: "Down-and-out deviation with ptosis.", f: (side) => setNerve(side, 3, 0) },
  "CN IV Palsy": { s: ['R', 'L', 'B'], prev: "0.5", desc: "Superior oblique weakness causing hypertropia.", f: (side) => setNerve(side, 4, 0) },
  "CN VI Palsy": { s: ['R', 'L', 'B'], prev: "1.1", desc: "Abduction deficit; most common ocular palsy.", f: (side) => setNerve(side, 6, 0) },
  "INO": { s: ['R', 'L', 'B'], prev: "0.3", desc: "Lesion of MLF; adduction deficit on side of lesion.", f: (side) => {
    if(side==='right'||side==='both') SYSTEM_STATE.muscles.right.MR = 0;
    if(side==='left'||side==='both') SYSTEM_STATE.muscles.left.MR = 0;
  }},
  "Graves TED": { s: ['R', 'L', 'B'], prev: "2.5", desc: "Restrictive myopathy; IR/MR usually thickest.", f: (side) => {
    const t = side === 'both' ? ['right','left'] : [side];
    t.forEach(s => { SYSTEM_STATE.muscles[s].IR = 0.5; SYSTEM_STATE.muscles[s].MR = 0.5; });
  }},
  "Blowout Fx": { s: ['R', 'L'], prev: "0.8", desc: "IR entrapment; limited vertical gaze.", f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; }},
  "Brown Syn.": { s: ['R', 'L'], prev: "0.2", desc: "SO tendon restriction; limited elevation in adduction.", f: (side) => { SYSTEM_STATE.muscles[side].IO = 0.1; }},
  "Myasthenia": { s: ['B'], prev: "2.0", desc: "Fluctuating fatigue of NMJ.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.4); }},
  "Parinaud": { s: ['B'], prev: "0.1", desc: "Dorsal midbrain syndrome; up-gaze paralysis.", f: () => { ['right','left'].forEach(s => { SYSTEM_STATE.muscles[s].SR = 0; SYSTEM_STATE.muscles[s].IO = 0; }); }},
  "Miller Fisher": { s: ['B'], prev: "0.05", desc: "Variant of GBS; acute total ophthalmoplegia.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.1); }}
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
    MUSCLES.forEach(m => {
      const v = SYSTEM_STATE.muscles[s][m];
      const el = document.querySelector(`#muscles${s==='left'?'L':'R'} .m-label-${m}`);
      if(el) el.className = `m-label clickable m-label-${m}` + (v===0.5?' paresis':(v===0?' paralysis':''));
    });
  });
}

function initUI() {
  const sides = [{ id: "musclesR", key: "right", label: "Right Eye (OD)" }, { id: "musclesL", key: "left", label: "Left Eye (OS)" }];
  sides.forEach(s => {
    const el = document.getElementById(s.id);
    el.innerHTML = `<div style="color:#4cc9f0; font-size:12px; font-weight:900; margin-bottom:10px;">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = `<div class="m-label clickable m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });

  const grid = document.getElementById('pathology-grid');
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
      ['R','B','L'].forEach(c => document.getElementById('btn-side-'+c).style.display = PATHOLOGIES[name].s.includes(c)?'block':'none');
    };
    grid.appendChild(btn);
  });
  document.getElementById("hud-container").style.opacity = "1";
}

// --- CORE CLINICAL LOGIC WITH DYNAMIC RE-SYNC ---
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

  // 1. DYNAMIC DRIFT (HERING'S LAW COMPENSATION)
  const rawDriftX = (1 - h.LR) * -0.45 + (1 - h.MR) * 0.45;
  const rawDriftY = (1 - h.SR) * -0.25 + (1 - h.IR) * 0.25 + (h.SO < 1 ? 0.25 : 0);
  
  // Resync logic: Reduce drift as eye moves into its functional nasal field
  const abductionField = isRight ? (targetYaw < 0) : (targetYaw > 0);
  const driftScale = abductionField ? 1.0 : Math.max(0, 1.0 - Math.abs(targetYaw) * 2.5);
  
  const activeDriftX = rawDriftX * driftScale;
  const activeDriftY = rawDriftY;

  // 2. MOTILITY MAPPING (CRISP RESPONSE)
  const mX = targetYaw > 0 ? targetYaw * h.MR : targetYaw * h.LR;
  const mY = targetPitch > 0 ? targetPitch * h.SR * 1.4 : targetPitch * h.IR * 1.2;

  const fYaw = activeDriftX + mX;
  const fPit = activeDriftY + mY;

  const abd = isRight ? -fYaw : fYaw;
  const add = -abd;
  const range = 1.8;

  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, abd) * range) * h.LR,
      MR: (0.2 + Math.max(0, add) * range) * h.MR,
      SR: (0.2 + Math.max(0, fPit) * 2.2) * h.SR,
      IR: (0.2 + Math.max(0, -fPit) * 1.8) * h.IR,
      IO: (0.2 + Math.max(0, fPit) * 2.0) * h.IO,
      SO: (0.2 + Math.max(0, -fPit) * 1.8) * h.SO
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

initUI();

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene; model.position.y = -1.6;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.traverse(o => {
    if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o;
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0 });
  });
  scene.add(model);
  document.getElementById("loading").style.display = "none";
  APP_STATE.ready = true;
  animate();
});

function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  if (APP_STATE.hasPointer) penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6);

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
