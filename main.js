import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 0.05, 1.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
APP.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 2.5);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(1, 1.2, 1.2);
scene.add(key);

// Mouse & Raycasting
const mouseNDC = new THREE.Vector2(0, 0);
let hasPointer = false;

window.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  hasPointer = true;
}, { passive: true });

const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3(0, 0, 1);
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Plane at z=0

// Model State
let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(25);
const MAX_PITCH = THREE.MathUtils.degToRad(15);
let yawSm = 0, pitchSm = 0;

// UI Helpers
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const makeMusclePanel = (el) => {
  if (!el) return;
  let html = el.innerHTML;
  for (const m of MUSCLES) {
    html += `
      <div class="row">
        <div>${m}</div>
        <div class="barWrap"><div class="bar" data-muscle="${m}"></div></div>
        <div class="pct" data-pct="${m}">0%</div>
      </div>`;
  }
  el.innerHTML = html;
};

makeMusclePanel(document.getElementById("musclesL"));
makeMusclePanel(document.getElementById("musclesR"));

const updateUI = (panelId, acts) => {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  for (const m of MUSCLES) {
    const bar = panel.querySelector(`.bar[data-muscle="${m}"]`);
    const pct = panel.querySelector(`.pct[data-pct="${m}"]`);
    const v = Math.max(0, Math.min(1, acts[m] ?? 0));
    bar.style.width = `${Math.round(v * 100)}%`;
    pct.textContent = `${Math.round(v * 100)}%`;
  }
};

function getMuscleActs(isRight, yNorm, pNorm) {
  const r = Math.max(0, yNorm), l = Math.max(0, -yNorm);
  const u = Math.max(0, pNorm), d = Math.max(0, -pNorm);
  return {
    LR: isRight ? r : l,
    MR: isRight ? l : r,
    SR: u * 0.8, IR: d * 0.8, SO: d * 0.6, IO: u * 0.6
  };
}

// Load GLB
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  scene.add(model);

  // Transparency Fix
  model.traverse(o => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if(m.transparent) m.depthWrite = false; });
    }
  });

  // Center model
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // CORRECTED NAMES
  eyeL = model.getObjectByName("Eye_L");
  eyeR = model.getObjectByName("Eye_R");

  if (!eyeL || !eyeR) console.warn("Eye_L or Eye_R not found in model hierarchy.");
});

function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      raycaster.ray.intersectPlane(gazePlane, target);
    } else {
      target.lerp(new THREE.Vector3(0, 0, 1), 0.05);
    }

    // Calculate rotation angles relative to eye positions
    // We look towards +Z, so we calculate angle from the eye origin to target
    const lookAtTarget = new THREE.Vector3().copy(target);
    
    // Simple conjugate gaze math
    const yawDes = Math.atan2(lookAtTarget.x, lookAtTarget.z + 0.5);
    const pitchDes = Math.atan2(-lookAtTarget.y, lookAtTarget.z + 0.5);

    yawSm = THREE.MathUtils.lerp(yawSm, THREE.MathUtils.clamp(yawDes, -MAX_YAW, MAX_YAW), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, THREE.MathUtils.clamp(pitchDes, -MAX_PITCH, MAX_PITCH), 0.1);

    // Apply to Three.js Y-axis (Yaw) and X-axis (Pitch)
    eyeL.rotation.y = yawSm;
    eyeL.rotation.x = pitchSm;
    eyeR.rotation.y = yawSm;
    eyeR.rotation.x = pitchSm;

    // UI Updates
    updateUI("musclesL", getMuscleActs(false, yawSm/MAX_YAW, pitchSm/MAX_PITCH));
    updateUI("musclesR", getMuscleActs(true, yawSm/MAX_YAW, pitchSm/MAX_PITCH));
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
