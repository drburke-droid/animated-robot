import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// --- 1. Scene & Rendering ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
APP.appendChild(renderer.domElement);

// --- 2. Lighting (Anti-Striation Fix) ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 5, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0005; 
keyLight.shadow.normalBias = 0.05;
scene.add(keyLight);

// --- 3. Interaction ---
const mouseNDC = new THREE.Vector2(0, 0);
let hasPointer = false;
window.addEventListener("pointermove", (e) => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  hasPointer = true;
}, { passive: true });

const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3(0, 0, 2);
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5); 

// --- 4. Deep-Dive Anatomical Logic ---
let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(30);
const MAX_PITCH = THREE.MathUtils.degToRad(22);
let yawSm = 0, pitchSm = 0;

/**
 * Calculates recruitment based on the "H-Test" clinical mechanics.
 * @param {boolean} isRight - Is this the subject's right eye?
 * @param {number} yN - Normalized Yaw (-1 to 1)
 * @param {number} pN - Normalized Pitch (-1 to 1)
 */
function getMuscleActs(isRight, yN, pN) {
  const tone = 0.20; // Basal tone in primary gaze (20% active)
  const range = 0.80; // Available dynamic range

  // Horizontal Vectors
  const abduct = isRight ? Math.max(0, yN) : Math.max(0, -yN); 
  const adduct = isRight ? Math.max(0, -yN) : Math.max(0, yN); 
  
  // Vertical Vectors
  const up = Math.max(0, pN);
  const down = Math.max(0, -pN);

  // Efficiency scaling: 
  // Recti gain advantage in abduction (looking out)
  // Obliques gain advantage in adduction (looking in)
  const effRecti = 0.4 + (abduct * 0.6); 
  const effObliques = 0.4 + (adduct * 0.6);

  // Sherrington's Law: As one muscle fires, the antagonist slightly inhibits below tone
  const inhibit = (val) => Math.max(-0.1, -val * 0.5);

  return {
    LR: tone + (abduct * range) + inhibit(adduct),
    MR: tone + (adduct * range) + inhibit(abduct),
    
    // Superior Rectus: Primary elevator in abduction
    SR: tone + (up * effRecti * range) + inhibit(down),
    // Inferior Rectus: Primary depressor in abduction
    IR: tone + (down * effRecti * range) + inhibit(up),
    
    // Superior Oblique: Primary depressor in ADduction
    SO: tone + (down * effObliques * range) + inhibit(up),
    // Inferior Oblique: Primary elevator in ADduction
    IO: tone + (up * effObliques * range) + inhibit(down)
  };
}

// --- 5. UI Updates ---
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const updateUI = (id, acts) => {
  const panel = document.getElementById(id);
  if (!panel) return;
  MUSCLES.forEach(m => {
    const bar = panel.querySelector(`.bar[data-muscle="${m}"]`);
    const pct = panel.querySelector(`.pct[data-pct="${m}"]`);
    const v = THREE.MathUtils.clamp(acts[m], 0, 1);
    bar.style.width = `${Math.round(v * 100)}%`;
    pct.textContent = `${Math.round(v * 100)}%`;
  });
};

// --- 6. Loading ---
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.8 / size.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, (-center.y * scale) - 0.25, -center.z * scale);

  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; 
      o.receiveShadow = true;
      if (o.name.toLowerCase().includes("cornea")) {
        o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, ior: 1.33, transparent: true, opacity: 0.1, depthWrite: false });
        o.renderOrder = 10;
      }
    }
    if (o.name === "Eye_L") eyeL = o;
    if (o.name === "Eye_R") eyeR = o;
  });
  model.updateMatrixWorld(true);
});

// --- 7. Loop ---
function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      raycaster.ray.intersectPlane(gazePlane, target);
    } else {
      target.lerp(new THREE.Vector3(0, 0, 2), 0.05);
    }

    const yawVal = Math.atan2(target.x, target.z);
    const pitchVal = Math.atan2(-target.y, target.z);

    yawSm = THREE.MathUtils.lerp(yawSm, THREE.MathUtils.clamp(yawVal, -MAX_YAW, MAX_YAW), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, THREE.MathUtils.clamp(pitchVal, -MAX_PITCH, MAX_PITCH), 0.1);

    eyeL.rotation.set(pitchSm, yawSm, 0, 'YXZ');
    eyeR.rotation.set(pitchSm, yawSm, 0, 'YXZ');

    // UI Calculations
    const actsL = getMuscleActs(false, yawSm/MAX_YAW, pitchSm/MAX_PITCH);
    const actsR = getMuscleActs(true, yawSm/MAX_YAW, pitchSm/MAX_PITCH);

    updateUI("musclesL", actsL);
    updateUI("musclesR", actsR);

    // CN Lights Logic
    const thr = 0.28;
    const cn3 = (actsL.MR > thr || actsL.SR > thr || actsL.IR > thr || actsL.IO > thr || actsR.MR > thr || actsR.SR > thr || actsR.IR > thr || actsR.IO > thr);
    const cn4 = (actsL.SO > thr || actsR.SO > thr);
    const cn6 = (actsL.LR > thr || actsR.LR > thr);
    document.getElementById("cn3").classList.toggle("on", cn3);
    document.getElementById("cn4").classList.toggle("on", cn4);
    document.getElementById("cn6").classList.toggle("on", cn6);
  }
  renderer.render(scene, camera);
}
animate();
