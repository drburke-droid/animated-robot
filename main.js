import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 0.05, 1.5); // Backed up slightly

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

// Mouse logic
const mouseNDC = new THREE.Vector2(0, 0);
let hasPointer = false;

function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  hasPointer = true;
}
window.addEventListener("pointermove", setPointerFromEvent, { passive: true });
window.addEventListener("pointerleave", () => { hasPointer = false; }, { passive: true });

// Raycasting and Target
const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3(0, 0.05, 1);
const debugDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01), 
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
scene.add(debugDot);

// Model refs
let model = null, eyeL = null, eyeR = null;

// Settings
const MAX_YAW = THREE.MathUtils.degToRad(30);
const MAX_PITCH = THREE.MathUtils.degToRad(20);
let yawSm = 0, pitchSm = 0;

// UI Helpers
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const makeMusclePanel = (el) => {
  for (const m of MUSCLES) {
    el.innerHTML += `
      <div class="row">
        <div>${m}</div>
        <div class="barWrap"><div class="bar" data-muscle="${m}"></div></div>
        <div class="pct" data-pct="${m}">0%</div>
      </div>`;
  }
};
makeMusclePanel(document.getElementById("musclesL"));
makeMusclePanel(document.getElementById("musclesR"));

const setBars = (panelId, acts) => {
  const panel = document.getElementById(panelId);
  for (const m of MUSCLES) {
    const bar = panel.querySelector(`.bar[data-muscle="${m}"]`);
    const pct = panel.querySelector(`.pct[data-pct="${m}"]`);
    const v = Math.max(0, Math.min(1, acts[m] ?? 0));
    bar.style.width = `${Math.round(v * 100)}%`;
    pct.textContent = `${Math.round(v * 100)}%`;
  }
};

const setCN = (cn3, cn4, cn6) => {
  document.getElementById("cn3").classList.toggle("on", cn3);
  document.getElementById("cn4").classList.toggle("on", cn4);
  document.getElementById("cn6").classList.toggle("on", cn6);
};

function muscleEstimateForEye(isRightEye, yawNorm, pitchNorm) {
  const right = Math.max(0, yawNorm), left = Math.max(0, -yawNorm);
  const up = Math.max(0, pitchNorm), down = Math.max(0, -pitchNorm);
  let LR = isRightEye ? right : left;
  let MR = isRightEye ? left : right;
  return { LR, MR, SR: up * 0.7, IR: down * 0.7, SO: down * 0.7, IO: up * 0.7 };
}

// Load Model
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  scene.add(model);

  // Transparency Fix
  model.traverse(o => {
    if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if(m.transparent) m.depthWrite = false;
        });
    }
  });

  // Auto-center
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // Name check from your console logs
  eyeL = model.getObjectByName("Eye_L");
  eyeR = model.getObjectByName("Eye_L001");

  if (!eyeL || !eyeR) console.error("Eyes not found by name.");
});

function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      // Project mouse onto a plane 1 unit in front of the model
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5); 
      raycaster.ray.intersectPlane(plane, target);
      debugDot.position.copy(target);
    }

    // Local conversion
    const localTarget = new THREE.Vector3().copy(target);
    eyeL.parent.worldToLocal(localTarget);

    const yawDes = Math.atan2(localTarget.x - eyeL.position.x, localTarget.z - eyeL.position.z);
    const pitchDes = Math.atan2(-(localTarget.y - eyeL.position.y), localTarget.z - eyeL.position.z);

    yawSm = THREE.MathUtils.lerp(yawSm, Math.max(-MAX_YAW, Math.min(MAX_YAW, yawDes)), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitchDes)), 0.1);

    // Apply Rotation
    eyeL.rotation.y = yawSm; 
    eyeL.rotation.x = pitchSm;
    eyeR.rotation.y = yawSm;
    eyeR.rotation.x = pitchSm;

    // UI Updates
    const actsL = muscleEstimateForEye(false, yawSm/MAX_YAW, pitchSm/MAX_PITCH);
    const actsR = muscleEstimateForEye(true, yawSm/MAX_YAW, pitchSm/MAX_PITCH);
    setBars("musclesL", actsL);
    setBars("musclesR", actsR);
    setCN(true, false, false); // Placeholder
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
