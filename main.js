import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5 };
const uiCache = { left: {}, right: {}, cn: {} };

// --- 1. Clinical State Management ---
// Values: 1.0 (Healthy), 0.5 (Paresis), 0.0 (Paralysis)
const SYSTEM_STATE = {
  nerves: { "R-CN3": 1, "R-CN4": 1, "R-CN6": 1, "L-CN3": 1, "L-CN4": 1, "L-CN6": 1 },
  muscles: { 
    right: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 },
    left: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 }
  }
};

// Global toggle for clicking UI elements
window.toggleState = (id, side = null, muscle = null) => {
  let current;
  if (muscle) {
    current = SYSTEM_STATE.muscles[side][muscle];
    SYSTEM_STATE.muscles[side][muscle] = current === 1 ? 0.5 : (current === 0.5 ? 0 : 1);
  } else {
    current = SYSTEM_STATE.nerves[id];
    SYSTEM_STATE.nerves[id] = current === 1 ? 0.5 : (current === 0.5 ? 0 : 1);
  }
  updateUIStyles();
};

function updateUIStyles() {
  // Update Nerves
  for (const [id, val] of Object.entries(SYSTEM_STATE.nerves)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.remove("paresis", "paralysis");
    if (val === 0.5) el.classList.add("paresis");
    if (val === 0) el.classList.add("paralysis");
  }
  // Update Muscle Labels
  ['left', 'right'].forEach(side => {
    const prefix = side === 'left' ? 'L-' : 'R-';
    MUSCLES.forEach(m => {
      const val = SYSTEM_STATE.muscles[side][m];
      const el = document.querySelector(`#muscles${side === 'left' ? 'L' : 'R'} .m-label-${m}`);
      if (!el) return;
      el.classList.remove("paresis", "paralysis");
      if (val === 0.5) el.classList.add("paresis");
      if (val === 0) el.classList.add("paralysis");
    });
  });
}

// --- 2. UI Initialization ---
function initUI() {
  const containerHUD = document.getElementById("hud-container");
  const sides = [
    { id: "musclesR", key: "right", label: "Right Eye (OD)" },
    { id: "musclesL", key: "left", label: "Left Eye (OS)" }
  ];

  sides.forEach(s => {
    const el = document.getElementById(s.id);
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      // Added class m-label-${m} for color targeting and onclick for muscle palsy
      row.innerHTML = `
        <div class="m-label clickable m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')">${m}</div>
        <div class="barWrap"><div class="bar"></div></div>
        <div class="pct">0%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });
  containerHUD.style.opacity = "1";
}

// --- 3. Anatomical Recruitment with Palsy Logic ---
function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  
  // 3a. Calculate Nerve/Muscle Health Multipliers
  const health = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  // 3b. Primary Gaze Deviations (Resting Tone)
  // CN6 Palsy -> Esotropia (Eye pulled in by healthy MR)
  let driftX = (1.0 - health.LR) * -0.35 + (1.0 - health.MR) * 0.35;
  // CN3 Palsy -> "Down and Out" (Depressed by SO, Abducted by LR)
  let driftY = (1.0 - health.SR) * -0.15 + (1.0 - health.IR) * 0.15;
  // CN4 Palsy -> Hypertropia (Eye sits higher)
  if (health.SO < 1) driftY += (1.0 - health.SO) * 0.1;

  // 3c. Calculate Resultant Eye Position (Motility)
  // If a muscle is paralyzed, it cannot pull the eye into that quadrant.
  const motilityX = targetYaw > 0 ? targetYaw * health.MR : targetYaw * health.LR;
  const motilityY = targetPitch > 0 ? targetPitch * health.SR : targetPitch * health.IR;

  const finalYaw = motilityX + (isRight ? -driftX : driftX);
  const finalPitch = motilityY + driftY;

  // 3d. Calculate Muscle Recruitment Bars
  const tone = 0.20;
  const range = 1.6;
  const abd = isRight ? -finalYaw : finalYaw;
  const add = -abd;
  const up = Math.max(0, finalPitch);
  const down = Math.max(0, -finalPitch);

  const rectiEff = 0.2 + (Math.max(0, abd) * 0.8); 
  const oblEff = 0.2 + (Math.max(0, add) * 0.8);

  return {
    rotation: { y: finalYaw, x: finalPitch },
    acts: {
      LR: (tone + Math.max(0, abd) * range) * health.LR,
      MR: (tone + Math.max(0, add) * range) * health.MR,
      SR: (tone + up * rectiEff * range) * health.SR,
      IR: (tone + down * rectiEff * range) * health.IR,
      IO: (tone + up * oblEff * range) * health.IO,
      SO: (tone + down * oblEff * range) * health.SO
    }
  };
}

// --- 4. Scene & Rendering ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = APP_STATE.zoom;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById("app").appendChild(renderer.domElement);

const penlight = new THREE.PointLight(0xffffff, 80, 12);
scene.add(penlight);
scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.3));

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5);
const targetVec = new THREE.Vector3();
let eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  APP_STATE.hasPointer = true;
});

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  APP_STATE.zoom = THREE.MathUtils.clamp(APP_STATE.zoom + e.deltaY * 0.008, 3, 14);
  camera.position.z = APP_STATE.zoom;
}, { passive: false });

initUI();

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  const model = gltf.scene;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.position.y = -1.6;
  model.traverse(o => {
    if (o.name.toLowerCase().includes("cornea")) {
      o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, ior: 1.45, thickness: 0.1, transparent: true });
    }
    if (o.name === "Eye_L") eyeL = o;
    if (o.name === "Eye_R") eyeR = o;
  });
  scene.add(model);
  document.getElementById("loading").style.display = "none";
  APP_STATE.ready = true;
  animate();
});

function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  
  if (APP_STATE.hasPointer) {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(gazePlane, targetVec);
    penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6);
  }

  [ {mesh: eyeL, isRight: false, side: "left"}, {mesh: eyeR, isRight: true, side: "right"} ].forEach(item => {
    if (!item.mesh) return;
    const eyeWorldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(eyeWorldPos);
    const dir = new THREE.Vector3().subVectors(targetVec, eyeWorldPos).normalize();
    
    const rawYaw = Math.atan2(dir.x, dir.z);
    const rawPitch = Math.asin(dir.y);

    const result = getRecruitment(item.isRight, rawYaw, rawPitch);
    
    // Set Rotation
    item.mesh.rotation.set(-result.rotation.x, result.rotation.y, 0, 'YXZ');
    
    // Update HUD
    MUSCLES.forEach(m => {
      const val = result.acts[m];
      const visualVal = THREE.MathUtils.clamp(val / 0.7, 0, 1);
      const displayVal = THREE.MathUtils.clamp(Math.round((val / 0.7) * 100), 0, 100);
      const cache = uiCache[item.side][m];
      cache.bar.style.width = (visualVal * 100) + "%";
      cache.pct.innerText = displayVal + "%";
      // Highlight bar if palsy exists
      cache.bar.style.background = val === 0 ? "#ff4d6d" : (val < 0.25 ? "#ffb703" : "#4cc9f0");
    });
  });

  renderer.render(scene, camera);
}
