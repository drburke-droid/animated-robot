import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5 };
const uiCache = { left: {}, right: {} };
const gazeDot = document.getElementById('gaze-dot');

const SYSTEM_STATE = {
  nerves: { "R-CN3": 1, "R-CN4": 1, "R-CN6": 1, "L-CN3": 1, "L-CN4": 1, "L-CN6": 1 },
  muscles: { 
    right: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 },
    left: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 }
  }
};

const PATHOLOGIES = {
  "CN III Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 3, 0) },
  "CN IV Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 4, 0) },
  "CN VI Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 6, 0) },
  "INO (MLF)": { s: ['R', 'L', 'B'], f: (side) => {
    if(side==='right'||side==='both') SYSTEM_STATE.muscles.right.MR = 0;
    if(side==='left'||side==='both') SYSTEM_STATE.muscles.left.MR = 0;
  }},
  "Graves (TED)": { s: ['R', 'L', 'B'], f: (side) => {
    const t = side==='both' ? ['right','left'] : [side];
    t.forEach(s => { SYSTEM_STATE.muscles[s].IR = 0.3; SYSTEM_STATE.muscles[s].MR = 0.5; });
  }},
  "Blowout Fx": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; }},
  "Brown Syn.": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IO = 0; }},
  "Myasthenia": { s: ['B'], f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.4); }},
  "Wallenberg": { s: ['R', 'L'], f: (side) => { 
    const isR = side === 'right';
    SYSTEM_STATE.muscles[isR?'right':'left'].IR = 0.5; 
    SYSTEM_STATE.muscles[isR?'left':'right'].SR = 0.5; 
  }}
};

let activePathName = null;

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

window.applyPathology = (side) => {
  resetSystem();
  PATHOLOGIES[activePathName].f(side);
  updateUIStyles();
  document.getElementById('side-modal').style.display = 'none';
};

function updateUIStyles() {
  Object.entries(SYSTEM_STATE.nerves).forEach(([id, v]) => {
    const el = document.getElementById(id); if(!el) return;
    el.className = 'pill' + (v === 0.5 ? ' paresis' : (v === 0 ? ' paralysis' : ''));
  });
  ['left','right'].forEach(s => {
    const sideKey = s === 'left' ? 'L' : 'R';
    MUSCLES.forEach(m => {
      const v = SYSTEM_STATE.muscles[s][m];
      const el = document.querySelector(`#muscles${sideKey} .m-label-${m}`);
      if(el) el.className = `m-label m-label-${m}` + (v===0.5?' paresis':(v===0?' paralysis':''));
    });
  });
}

function initUI() {
  const sides = [{ id: "musclesR", key: "right", label: "OD (Right Eye)" }, { id: "musclesL", key: "left", label: "OS (Left Eye)" }];
  sides.forEach(s => {
    const el = document.getElementById(s.id);
    el.innerHTML = `<div style="color:#4cc9f0; font-weight:bold; margin-bottom:8px; border-bottom:1px solid #333;">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = `<div class="m-label m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')" style="cursor:pointer">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });

  const grid = document.getElementById('pathology-grid');
  Object.keys(PATHOLOGIES).forEach(name => {
    const btn = document.createElement('div'); btn.className = 'pill'; btn.innerText = name;
    btn.onclick = () => {
      activePathName = name;
      document.getElementById('side-modal').style.display = 'flex';
    };
    grid.appendChild(btn);
  });
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

  const driftX = (1 - h.LR) * -0.4 + (1 - h.MR) * 0.4;
  const driftY = (1 - h.SR) * -0.25 + (1 - h.IR) * 0.25 + (h.SO < 1 ? 0.25 : 0);

  let allowedYaw;
  if (isRight) {
    if (targetYaw < 0) allowedYaw = targetYaw * h.LR;
    else allowedYaw = targetYaw * h.MR;
  } else {
    if (targetYaw > 0) allowedYaw = targetYaw * h.LR;
    else allowedYaw = targetYaw * h.MR;
  }

  const isNasal = (isRight && targetYaw > 0) || (!isRight && targetYaw < 0);
  
  // ANATOMICAL FIX: Superior Oblique (SO) and Inferior Rectus (IR) Depressor Balance
  // SO is the primary depressor only in ADduction (nasal gaze).
  // IR is the primary depressor in ABduction (temporal gaze).
  let mY;
  if (targetPitch > 0) { // Elevation
    mY = isNasal ? targetPitch * h.IO : targetPitch * h.SR * 1.4;
  } else { // Depression
    mY = isNasal ? targetPitch * h.SO : targetPitch * h.IR * 1.6;
  }

  const fYaw = allowedYaw + (isRight ? -driftX : driftX);
  const fPit = mY + driftY;
  const abd = isRight ? -fYaw : fYaw;
  const add = -abd;

  // Percentage Calculations for bars (Capped at 100%)
  // SO effort must drop when eye moves Temporal (Abduction)
  const soEffortBase = Math.max(0, -fPit) * 2.0;
  const soTemporalInhibition = isNasal ? 1.0 : 0.25; 

  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, abd) * 1.8) * h.LR,
      MR: (0.2 + Math.max(0, add) * 1.8) * h.MR,
      SR: (0.2 + Math.max(0, fPit) * 2.2) * h.SR,
      IR: (0.2 + Math.max(0, -fPit) * 2.0 * (isNasal ? 0.5 : 1.0)) * h.IR,
      IO: (0.2 + Math.max(0, fPit) * 2.0 * (isNasal ? 1.0 : 0.5)) * h.IO,
      SO: (0.2 + soEffortBase * soTemporalInhibition) * h.SO
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

const handleInput = (x, y) => {
  const m = { x: (x / window.innerWidth) * 2 - 1, y: -(y / window.innerHeight) * 2 + 1 };
  const r = new THREE.Raycaster(); r.setFromCamera(m, camera);
  r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), -2.5), targetVec);
  APP_STATE.hasPointer = true;
  gazeDot.style.display = 'block';
  gazeDot.style.left = x + 'px';
  gazeDot.style.top = y + 'px';
}

window.addEventListener("pointermove", (e) => handleInput(e.clientX, e.clientY));
window.addEventListener("touchmove", (e) => {
    e.preventDefault();
    handleInput(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

initUI();

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene; 
  model.position.y = -0.6; 
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.traverse(o => {
    if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o;
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0 });
  });
  scene.add(model);
  document.getElementById("app").style.opacity = "1";
  APP_STATE.ready = true;
  animate();
});

function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  if (APP_STATE.hasPointer) penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6);
  [ {mesh: eyeL, isR: false, s: "left"}, {mesh: eyeR, isR: true, s: "right"} ].forEach(i => {
    if (!i.mesh) return;
    const eyePos = new THREE.Vector3(); i.mesh.getWorldPosition(eyePos);
    
    // CALIBRATION FIX: Offset primary position slightly to fix alignment
    const yaw = Math.atan2(targetVec.x - (eyePos.x * 1.05), targetVec.z - eyePos.z);
    const pitch = Math.atan2(targetVec.y - eyePos.y, targetVec.z - eyePos.z);
    
    const res = getRecruitment(i.isR, yaw, pitch);
    i.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ');
    
    MUSCLES.forEach(m => {
      const cache = uiCache[i.s][m];
      const valDisplay = Math.min(100, Math.round((res.acts[m] / 0.7) * 100));
      cache.bar.style.width = valDisplay + "%";
      cache.pct.innerText = valDisplay + "%";
      cache.bar.style.background = res.acts[m] < 0.05 ? "#ff4d6d" : (res.acts[m] < 0.25 ? "#ffb703" : "#4cc9f0");
    });
  });
  renderer.render(scene, camera);
}
