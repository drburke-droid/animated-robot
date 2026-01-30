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
  for (const [id, val] of Object.entries(SYSTEM_STATE.nerves)) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("paresis", "paralysis");
      if (val === 0.5) el.classList.add("paresis");
      if (val === 0) el.classList.add("paralysis");
    }
  }
  ['left', 'right'].forEach(side => {
    MUSCLES.forEach(m => {
      const val = SYSTEM_STATE.muscles[side][m];
      const el = document.querySelector(`#muscles${side === 'left' ? 'L' : 'R'} .m-label-${m}`);
      if (el) {
        el.classList.remove("paresis", "paralysis");
        if (val === 0.5) el.classList.add("paresis");
        if (val === 0) el.classList.add("paralysis");
      }
    });
  });
}

function initUI() {
  const sides = [{ id: "musclesR", key: "right", label: "Right Eye (OD)" }, { id: "musclesL", key: "left", label: "Left Eye (OS)" }];
  sides.forEach(s => {
    const el = document.getElementById(s.id);
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="m-label clickable m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });
  document.getElementById("hud-container").style.opacity = "1";
  document.getElementById("tiltSlider").addEventListener("input", (e) => {
    APP_STATE.headTilt = THREE.MathUtils.degToRad(parseFloat(e.target.value));
  });
}

// --- CORE CLINICAL LOGIC ---
function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  
  // FIXED MAPPING: CN6 only affects LR. CN3 affects MR, SR, IR, IO. CN4 affects SO.
  const health = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  // Bielschowsky Tilt Effect (CN IV)
  let tiltDrift = 0;
  if (health.SO < 1) {
    const tiltDir = isRight ? -APP_STATE.headTilt : APP_STATE.headTilt;
    if (tiltDir > 0) tiltDrift = tiltDir * (1.0 - health.SO) * 0.45;
  }

  // Drift/Deviations
  let driftX = (1.0 - health.LR) * -0.45 + (1.0 - health.MR) * 0.45;
  let driftY = (1.0 - health.SR) * -0.3 + (1.0 - health.IR) * 0.3 + tiltDrift;
  if (health.SO < 1) driftY += (1.0 - health.SO) * 0.25;

  // Motility Limits
  const motilityX = targetYaw > 0 ? targetYaw * health.MR : targetYaw * health.LR;
  let motilityY;
  const isNasal = (isRight && targetYaw > 0) || (!isRight && targetYaw < 0);
  
  if (targetPitch < 0) {
    motilityY = isNasal ? targetPitch * health.SO : targetPitch * health.IR;
  } else {
    motilityY = isNasal ? targetPitch * health.IO : targetPitch * health.SR;
  }

  const finalYaw = motilityX + (isRight ? -driftX : driftX);
  const finalPitch = motilityY + driftY;
  
  const abd = isRight ? -finalYaw : finalYaw;
  const add = -abd;
  const range = 1.6;

  return {
    rotation: { y: finalYaw, x: finalPitch },
    acts: {
      LR: (0.2 + Math.max(0, abd) * range) * health.LR,
      MR: (0.2 + Math.max(0, add) * range) * health.MR,
      SR: (0.2 + Math.max(0, finalPitch) * (0.2 + Math.max(0, abd) * 0.8) * range) * health.SR,
      IR: (0.2 + Math.max(0, -finalPitch) * (0.2 + Math.max(0, abd) * 0.8) * range) * health.IR,
      IO: (0.2 + Math.max(0, finalPitch) * (0.2 + Math.max(0, add) * 0.8) * range) * health.IO,
      SO: (0.2 + Math.max(0, -finalPitch) * (0.2 + Math.max(0, add) * 0.8) * range) * health.SO
    }
  };
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.z = APP_STATE.zoom;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById("app").appendChild(renderer.domElement);

const penlight = new THREE.PointLight(0xffffff, 80, 12);
scene.add(penlight);
scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.3));

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5);
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

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
  model = gltf.scene;
  model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  model.position.y = -1.6;
  model.traverse(o => {
    if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, transparent: true });
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
  if (model) model.rotation.z = APP_STATE.headTilt;

  [ {mesh: eyeL, isRight: false, side: "left"}, {mesh: eyeR, isRight: true, side: "right"} ].forEach(item => {
    if (!item.mesh) return;
    const eyePos = new THREE.Vector3();
    item.mesh.getWorldPosition(eyePos);
    const dir = new THREE.Vector3().subVectors(targetVec, eyePos).normalize();
    const res = getRecruitment(item.isRight, Math.atan2(dir.x, dir.z), Math.asin(dir.y));
    item.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ');
    MUSCLES.forEach(m => {
      const cache = uiCache[item.side][m];
      const val = res.acts[m];
      cache.bar.style.width = Math.min(100, (val / 0.7) * 100) + "%";
      cache.pct.innerText = Math.min(100, Math.round((val / 0.7) * 100)) + "%";
      cache.bar.style.background = val < 0.05 ? "#ff4d6d" : (val < 0.25 ? "#ffb703" : "#4cc9f0");
    });
  });
  renderer.render(scene, camera);
}
