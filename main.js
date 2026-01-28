import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// --- 1. Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 5); // Positioned for a natural portrait view

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
APP.appendChild(renderer.domElement);

// --- 2. Lighting ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);

// --- 3. Interaction & Raycasting ---
const mouseNDC = new THREE.Vector2(0, 0);
let hasPointer = false;

window.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  hasPointer = true;
}, { passive: true });

const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3(0, 0, 2);
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5); 

// --- 4. Model State ---
let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(30);
const MAX_PITCH = THREE.MathUtils.degToRad(22);
let yawSm = 0, pitchSm = 0;

// --- 5. Anatomical Logic & UI ---
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];

function makeMusclePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  MUSCLES.forEach(m => {
    el.innerHTML += `
      <div class="row">
        <div>${m}</div>
        <div class="barWrap"><div class="bar" data-muscle="${m}"></div></div>
        <div class="pct" data-pct="${m}">0%</div>
      </div>`;
  });
}
makeMusclePanel("musclesL");
makeMusclePanel("musclesR");

function updateUI(panelId, acts) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  MUSCLES.forEach(m => {
    const bar = panel.querySelector(`.bar[data-muscle="${m}"]`);
    const pct = panel.querySelector(`.pct[data-pct="${m}"]`);
    const v = THREE.MathUtils.clamp(acts[m] ?? 0, 0, 1);
    bar.style.width = `${Math.round(v * 100)}%`;
    pct.textContent = `${Math.round(v * 100)}%`;
  });
}

function setCN(cn3, cn4, cn6) {
  document.getElementById("cn3").classList.toggle("on", cn3);
  document.getElementById("cn4").classList.toggle("on", cn4);
  document.getElementById("cn6").classList.toggle("on", cn6);
}

/**
 * Anatomically Accurate Muscle Engagement
 * Accounts for primary vs secondary actions based on eye abduction/adduction
 */
function getMuscleActs(isRight, yNorm, pNorm) {
  const tone = 0.15; // Baseline resting engagement
  const range = 0.85;

  // Directions
  const gazeOut = isRight ? Math.max(0, yNorm) : Math.max(0, -yNorm); // Abduction
  const gazeIn = isRight ? Math.max(0, -yNorm) : Math.max(0, yNorm);  // Adduction
  const up = Math.max(0, pNorm);
  const down = Math.max(0, -pNorm);

  // Efficiency Factors: 
  // Vertical Recti are strongest when eye is out. 
  // Obliques are strongest when eye is in.
  const effRecti = 0.4 + (gazeOut * 0.6); 
  const effObliques = 0.4 + (gazeIn * 0.6);

  return {
    LR: tone + (gazeOut * range),
    MR: tone + (gazeIn * range),
    SR: tone + (up * effRecti * range),
    IR: tone + (down * effRecti * range),
    SO: tone + (down * effObliques * range),
    IO: tone + (up * effObliques * range)
  };
}

// --- 6. Model Loading & Normalization ---
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  scene.add(model);

  // Normalize Scale & Position
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Scale the model so it is always 1.8 units high in Three.js world
  const scale = 1.8 / size.y;
  model.scale.setScalar(scale);

  // Shift model so the center of geometry is at origin, then down slightly for framing
  model.position.x = -center.x * scale;
  model.position.y = (-center.y * scale) - 0.25; 
  model.position.z = -center.z * scale;

  model.traverse(o => {
    if (o.name === "Eye_L") eyeL = o;
    if (o.name === "Eye_R") eyeR = o;
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if(m.transparent) m.depthWrite = false; });
    }
  });

  camera.lookAt(0, 0, 0);
  model.updateMatrixWorld(true);
});

// --- 7. Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      raycaster.ray.intersectPlane(gazePlane, target);
    } else {
      target.lerp(new THREE.Vector3(0, 0, 2), 0.05);
    }

    // Gaze math relative to center
    const yawVal = Math.atan2(target.x, target.z);
    const pitchVal = Math.atan2(-target.y, target.z);

    // Smoothing
    yawSm = THREE.MathUtils.lerp(yawSm, THREE.MathUtils.clamp(yawVal, -MAX_YAW, MAX_YAW), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, THREE.MathUtils.clamp(pitchVal, -MAX_PITCH, MAX_PITCH), 0.1);

    // Apply rotation (YXZ order prevents gimbal lock for eyes)
    eyeL.rotation.set(pitchSm, yawSm, 0, 'YXZ');
    eyeR.rotation.set(pitchSm, yawSm, 0, 'YXZ');

    // Calculate Engagement
    const actsL = getMuscleActs(false, yawSm/MAX_YAW, pitchSm/MAX_PITCH);
    const actsR = getMuscleActs(true, yawSm/MAX_YAW, pitchSm/MAX_PITCH);

    // Update UI Bars
    updateUI("musclesL", actsL);
    updateUI("musclesR", actsR);

    // Cranial Nerve Logic
    const threshold = 0.25;
    const cn3 = (actsL.MR > threshold || actsL.SR > threshold || actsL.IR > threshold || actsL.IO > threshold ||
                 actsR.MR > threshold || actsR.SR > threshold || actsR.IR > threshold || actsR.IO > threshold);
    const cn4 = (actsL.SO > threshold || actsR.SO > threshold);
    const cn6 = (actsL.LR > threshold || actsR.LR > threshold);
    setCN(cn3, cn4, cn6);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
