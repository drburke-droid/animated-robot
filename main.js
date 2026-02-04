import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5, target: new THREE.Vector3() };
const uiCache = { left: {}, right: {} };

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
    const t = side==='both'?['right','left']:[side];
    t.forEach(s=>{ SYSTEM_STATE.muscles[s].IR=0.3; SYSTEM_STATE.muscles[s].MR=0.5; });
  }},
  "Blowout Fx": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; }},
  "Brown Syn.": { s: ['R', 'L'], f: (side) => { SYSTEM_STATE.muscles[side].IO = 0; }},
  "Miller Fisher": { s: ['B'], f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k=>SYSTEM_STATE.nerves[k]=0.1); }},
  "Wallenberg": { s: ['R', 'L'], f: (side) => { 
    const isR = side === 'right'; SYSTEM_STATE.muscles[isR?'right':'left'].IR=0.5; SYSTEM_STATE.muscles[isR?'left':'right'].SR=0.5; 
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
    const el = document.getElementById(s.id); if(!el) return;
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
    btn.onclick = () => {
      activePathName = name;
      document.getElementById('side-modal').style.display = 'flex';
      ['R', 'B', 'L'].forEach(c => {
        const sBtn = document.getElementById('btn-side-' + c);
        if (sBtn) sBtn.style.display = PATHOLOGIES[name].s.includes(c) ? 'block' : 'none';
      });
    };
    grid.appendChild(btn);
  });
  document.getElementById("hud-container").style.opacity = "1";
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
  const driftY = (1 - h.SR) * -0.1 + (1 - h.IR) * 0.1 + (h.SR === 0 && h.IR === 0 ? -0.25 : 0);

  let allowedYaw = isRight ? (targetYaw < 0 ? targetYaw * h.LR : targetYaw * h.MR) : (targetYaw > 0 ? targetYaw * h.LR : targetYaw * h.MR);

  // --- VERTICAL BLENDING REFINEMENT ---
  const nasalYaw = isRight ? targetYaw : -targetYaw;
  const blend = 1 / (1 + Math.exp(-(nasalYaw + 0.15) * 7)); // Smooth authority gradient

  let mY;
  if (targetPitch > 0) { // Elevation Authority
    mY = THREE.MathUtils.lerp(targetPitch * h.SR * 1.4, targetPitch * h.IO * 1.4, blend);
  } else { // Depression Authority
    mY = THREE.MathUtils.lerp(targetPitch * h.IR * 2.2, targetPitch * h.SO * 2.2, blend);
  }

  const fYaw = allowedYaw + (isRight ? -driftX : driftX);
  const fPit = mY + driftY;

  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, isRight ? -fYaw : fYaw) * 1.8) * h.LR,
      MR: (0.2 + Math.max(0, isRight ? fYaw : -fYaw) * 1.8) * h.MR,
      SR: (0.2 + Math.max(0, fPit) * 2.2 * (1 - blend)) * h.SR,
      IR: (0.2 + Math.max(0, -fPit) * 1.8 * (1 - blend)) * h.IR,
      IO: (0.2 + Math.max(0, fPit) * 2.0 * blend) * h.IO,
      SO: (0.2 + Math.max(0, -fPit) * 1.8 * blend + (h.IR === 0 ? 0.3 : 0)) * h.SO
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

window.addEventListener("pointermove", (e) => {
  const m = { x: (e.clientX/window.innerWidth)*2-1, y: -(e.clientY/window.innerHeight)*2+1 };
  const r = new THREE.Raycaster(); r.setFromCamera(m, camera);
  r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), -2.5), APP_STATE.target);
  APP_STATE.hasPointer = true;
});

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  const model = gltf.scene; model.position.y = -1.6;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  let eyeL, eyeR;
  model.traverse(o => {
    if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o;
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0 });
  });
  scene.add(model);
  
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initUI); } else { initUI(); }
  document.getElementById("loading").style.display = "none";
  APP_STATE.ready = true;

  function animate() {
    requestAnimationFrame(animate);
    if (!APP_STATE.ready || !APP_STATE.hasPointer) return;
    penlight.position.set(APP_STATE.target.x, APP_STATE.target.y, APP_STATE.target.z + 0.6);
    [ {mesh: eyeL, isR: false, s: "left"}, {mesh: eyeR, isR: true, s: "right"} ].forEach(i => {
      const eyePos = new THREE.Vector3(); i.mesh.getWorldPosition(eyePos);
      const res = getRecruitment(i.isR, Math.atan2(APP_STATE.target.x - eyePos.x, APP_STATE.target.z - eyePos.z), Math.atan2(APP_STATE.target.y - eyePos.y, APP_STATE.target.z - eyePos.z));
      i.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ');
      MUSCLES.forEach(m => {
        const cache = uiCache[i.s][m];
        const valDisplay = Math.min(100, Math.round((res.acts[m] / 0.7) * 100));
        cache.bar.style.width = valDisplay + "%"; cache.pct.innerText = valDisplay + "%";
        cache.bar.style.background = res.acts[m] < 0.05 ? "#ff4d6d" : (res.acts[m] < 0.25 ? "#ffb703" : "#4cc9f0");
      });
    });
    renderer.render(scene, camera);
  }
  animate();
});
