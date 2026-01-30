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

// --- PATHOLOGY DEFINITIONS ---
const PATHOLOGIES = {
  "CN III Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 3, 0) },
  "CN IV Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 4, 0) },
  "CN VI Palsy": { s: ['R', 'L', 'B'], f: (side) => setNerve(side, 6, 0) },
  "INO (MLF Lesion)": { s: ['R', 'L', 'B'], f: (side) => {
    if(side==='right'||side==='both') SYSTEM_STATE.muscles.right.MR = 0;
    if(side==='left'||side==='both') SYSTEM_STATE.muscles.left.MR = 0;
  }},
  "Graves (TED)": { s: ['R', 'L', 'B'], f: (side) => {
    const targets = side === 'both' ? ['right','left'] : [side];
    targets.forEach(t => { SYSTEM_STATE.muscles[t].IR = 0.3; SYSTEM_STATE.muscles[t].MR = 0.5; });
  }},
  "Blowout Fracture": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; }},
  "Brown Syndrome": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IO = 0.1; }},
  "Myasthenia Gravis": { s: ['B'], f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.4); }},
  "Parinaud Syn.": { s: ['B'], f: () => { ['right','left'].forEach(t => { SYSTEM_STATE.muscles[t].SR = 0; SYSTEM_STATE.muscles[t].IO = 0; }); }},
  "Duane (Type 1)": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.nerves[(side==='right'?'R':'L')+'-CN6'] = 0; }},
  "Miller Fisher": { s: ['B'], f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.1); }},
  "P-Com Aneurysm": { s: ['R', 'L'], f: (side) => setNerve(side, 3, 0) },
  "Tolosa-Hunt": { s: ['R', 'L'], f: (side) => { [3,4,6].forEach(n => setNerve(side, n, 0.4)); }},
  "Wernicke's": { s: ['B'], f: () => { setNerve('both', 6, 0.4); }},
  "Orbital Myositis": { s: ['R', 'L', 'B'], f: (side) => {
    const targets = side === 'both' ? ['right','left'] : [side];
    targets.forEach(t => { SYSTEM_STATE.muscles[t].LR = 0.2; });
  }},
  "One-and-a-Half": { s: ['R', 'L'], f: (side) => {
    // Ipsilateral gaze palsy + INO
    if(side==='right') { setNerve('right', 6, 0); SYSTEM_STATE.muscles.right.MR = 0; SYSTEM_STATE.muscles.left.MR = 0; }
    else { setNerve('left', 6, 0); SYSTEM_STATE.muscles.left.MR = 0; SYSTEM_STATE.muscles.right.MR = 0; }
  }}
};

let activePathName = null;
function setNerve(side, num, val) {
  if(side === 'both') { SYSTEM_STATE.nerves['R-CN'+num] = val; SYSTEM_STATE.nerves['L-CN'+num] = val; }
  else { SYSTEM_STATE.nerves[(side==='right'?'R':'L')+'-CN'+num] = val; }
}

// Global UI Linkage
window.toggleState = (id, side = null, muscle = null) => {
  let cur = muscle ? SYSTEM_STATE.muscles[side][muscle] : SYSTEM_STATE.nerves[id];
  let next = cur === 1 ? 0.5 : (cur === 0.5 ? 0 : 1);
  if (muscle) SYSTEM_STATE.muscles[side][muscle] = next; else SYSTEM_STATE.nerves[id] = next;
  updateUIStyles();
};

window.closeModal = () => document.getElementById('side-modal').style.display = 'none';
window.applyPathology = (side) => {
  const p = PATHOLOGIES[activePathName];
  // Clear system first
  Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 1);
  ['right','left'].forEach(s => MUSCLES.forEach(m => SYSTEM_STATE.muscles[s][m] = 1));
  p.f(side);
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
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
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
    btn.onclick = () => {
      activePathName = name;
      const p = PATHOLOGIES[name];
      document.getElementById('modal-disease-name').innerText = name;
      document.getElementById('side-modal').style.display = 'flex';
      ['R','B','L'].forEach(sideCode => {
        const sideId = 'btn-side-'+sideCode;
        document.getElementById(sideId).style.display = p.s.includes(sideCode) ? 'block' : 'none';
      });
    };
    grid.appendChild(btn);
  });

  document.getElementById("tiltSlider").oninput = (e) => APP_STATE.headTilt = THREE.MathUtils.degToRad(e.target.value);
  document.getElementById("hud-container").style.opacity = "1";
}

function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  const health = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  let driftX = (1.0 - health.LR) * -0.45 + (1.0 - health.MR) * 0.45;
  let tDir = isRight ? -APP_STATE.headTilt : APP_STATE.headTilt;
  let driftY = (1.0 - health.SR) * -0.3 + (1.0 - health.IR) * 0.3 + (health.SO < 1 && tDir > 0 ? tDir * 0.4 : 0);
  if (health.SO < 1) driftY += (1.0 - health.SO) * 0.25;

  const mX = targetYaw > 0 ? targetYaw * health.MR : targetYaw * health.LR;
  const isN = (isRight && targetYaw > 0) || (!isRight && targetYaw < 0);
  const mY = targetPitch < 0 ? (isN ? targetPitch * health.SO : targetPitch * health.IR) : (isN ? targetPitch * health.IO : targetPitch * health.SR);

  const fYaw = mX + (isRight ? -driftX : driftX);
  const fPit = mY + driftY;
  const abd = isRight ? -fYaw : fYaw; const add = -abd;

  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, abd) * 1.6) * health.LR,
      MR: (0.2 + Math.max(0, add) * 1.6) * health.MR,
      SR: (0.2 + Math.max(0, fPit) * (0.2 + Math.max(0, abd) * 0.8) * 1.6) * health.SR,
      IR: (0.2 + Math.max(0, -fPit) * (0.2 + Math.max(0, abd) * 0.8) * 1.6) * health.IR,
      IO: (0.2 + Math.max(0, fPit) * (0.2 + Math.max(0, add) * 0.8) * 1.6) * health.IO,
      SO: (0.2 + Math.max(0, -fPit) * (0.2 + Math.max(0, add) * 0.8) * 1.6) * health.SO
    }
  };
}

// Scene Init
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.z = APP_STATE.zoom;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("app").appendChild(renderer.domElement);

const penlight = new THREE.PointLight(0xffffff, 80, 12);
scene.add(penlight); scene.add(new THREE.HemisphereLight(0xffffff, 0, 0.3));

const raycaster = new THREE.Raycaster();
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  const m = { x: (e.clientX/window.innerWidth)*2-1, y: -(e.clientY/window.innerHeight)*2+1 };
  raycaster.setFromCamera(m, camera);
  raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), -2.5), targetVec);
  APP_STATE.hasPointer = true;
});

initUI();

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.position.y = -1.6;
  model.traverse(o => {
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, transparent: true });
    if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o;
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
  if (model) model.rotation.z = APP_STATE.headTilt;

  [ {mesh: eyeL, isRight: false, side: "left"}, {mesh: eyeR, isRight: true, side: "right"} ].forEach(item => {
    if (!item.mesh) return;
    const res = getRecruitment(item.isRight, Math.atan2(targetVec.x - item.mesh.position.x, 2.5), Math.atan2(targetVec.y - item.mesh.position.y, 2.5));
    item.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ');
    MUSCLES.forEach(m => {
      const cache = uiCache[item.side][m];
      const val = res.acts[m];
      cache.bar.style.width = Math.min(100, (val / 0.7) * 100) + "%";
      cache.pct.innerText = Math.round((val / 0.7) * 100) + "%";
      cache.bar.style.background = val < 0.05 ? "#ff4d6d" : (val < 0.25 ? "#ffb703" : "#4cc9f0");
    });
  });
  renderer.render(scene, camera);
}
