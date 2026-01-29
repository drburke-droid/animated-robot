import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];

// Cache UI elements so we don't query the DOM 60 times per second
const uiCache = {
  left: {},
  right: {},
  cn3: document.getElementById("cn3"),
  cn4: document.getElementById("cn4"),
  cn6: document.getElementById("cn6")
};

// --- 1. Scene & Camera ---
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

// --- 2. Lighting ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 5, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024); // Lowered slightly for performance
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

function getMuscleActs(isRight, yN, pN) {
  const tone = 0.20; 
  const range = 0.80; 

  const abduct = isRight ? Math.max(0, yN) : Math.max(0, -yN); 
  const adduct = isRight ? Math.max(0, -yN) : Math.max(0, yN); 
  const up = Math.max(0, pN);
  const down = Math.max(0, -pN);

  const effRecti = 0.4 + (abduct * 0.6); 
  const effObliques = 0.4 + (adduct * 0.6);
  const inhibit = (val) => Math.max(-0.1, -val * 0.5);

  return {
    LR: tone + (abduct * range) + inhibit(adduct),
    MR: tone + (adduct * range) + inhibit(abduct),
    SR: tone + (up * effRecti * range) + inhibit(down),
    IR: tone + (down * effRecti * range) + inhibit(up),
    SO: tone + (down * effObliques * range) + inhibit(up),
    IO: tone + (up * effObliques * range) + inhibit(down)
  };
}

// --- 5. UI Setup (Fixed the Null Error) ---
function initPanels() {
  ["musclesL", "musclesR"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const side = id === "musclesL" ? "left" : "right";
    
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="m-label">${m}</div>
        <div class="barWrap"><div class="bar"></div></div>
        <div class="pct">0%</div>`;
      el.appendChild(row);
      
      // Store references so we don't query later
      uiCache[side][m] = {
        bar: row.querySelector(".bar"),
        pct: row.querySelector(".pct")
      };
    });
  });
}

function updateUI(side, acts) {
  const cache = uiCache[side];
  MUSCLES.forEach(m => {
    const refs = cache[m];
    if (refs) {
      const v = THREE.MathUtils.clamp(acts[m], 0, 1);
      refs.bar.style.width = `${Math.round(v * 100)}%`;
      refs.pct.textContent = `${Math.round(v * 100)}%`;
    }
  });
}

initPanels();

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

    const actsL = getMuscleActs(false, yawSm/MAX_YAW, pitchSm/MAX_PITCH);
    const actsR = getMuscleActs(true, yawSm/MAX_YAW, pitchSm/MAX_PITCH);

    updateUI("left", actsL);
    updateUI("right", actsR);

    // CN Lights
    const thr = 0.28;
    if (uiCache.cn3) uiCache.cn3.classList.toggle("on", (actsL.MR > thr || actsL.SR > thr || actsL.IR > thr || actsL.IO > thr || actsR.MR > thr || actsR.SR > thr || actsR.IR > thr || actsR.IO > thr));
    if (uiCache.cn4) uiCache.cn4.classList.toggle("on", (actsL.SO > thr || actsR.SO > thr));
    if (uiCache.cn6) uiCache.cn6.classList.toggle("on", (actsL.LR > thr || actsR.LR > thr));
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
