import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// --- 1. Scene & Camera Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Slightly off-black for depth

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 5); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; // Enable Shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
APP.appendChild(renderer.domElement);

// --- 2. Enhanced Lighting ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.5));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 5, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

// Rim Light (back-side) to catch the edges of the head
const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
rimLight.position.set(-5, 2, -5);
scene.add(rimLight);

// Eye Catchlight (Point light near camera)
const eyeLight = new THREE.PointLight(0xffffff, 0.8);
eyeLight.position.set(0, 0, 4);
scene.add(eyeLight);

// --- 3. Interaction ---
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

// --- 4. State & UI ---
let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(25);
const MAX_PITCH = THREE.MathUtils.degToRad(18);
let yawSm = 0, pitchSm = 0;

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];

function makeMusclePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  MUSCLES.forEach(m => {
    el.innerHTML += `<div class="row"><div>${m}</div><div class="barWrap"><div class="bar" data-muscle="${m}"></div></div><div class="pct" data-pct="${m}">0%</div></div>`;
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

function getMuscleActs(isRight, yNorm, pNorm) {
  const t = 0.15, r = 0.85;
  const gOut = isRight ? Math.max(0, yNorm) : Math.max(0, -yNorm);
  const gIn = isRight ? Math.max(0, -yNorm) : Math.max(0, yNorm);
  const u = Math.max(0, pNorm), d = Math.max(0, -pNorm);
  const eR = 0.4 + (gOut * 0.6), eO = 0.4 + (gIn * 0.6);
  return { LR: t+(gOut*r), MR: t+(gIn*r), SR: t+(u*eR*r), IR: t+(d*eR*r), SO: t+(d*eO*r), IO: t+(u*eO*r) };
}

// --- 5. Loading & Shadows ---
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
      
      const name = o.name.toLowerCase();
      if (name.includes("cornea")) {
        o.material = new THREE.MeshPhysicalMaterial({
          transmission: 1.0, ior: 1.33, roughness: 0, transparent: true, opacity: 0.1, depthWrite: false, color: 0xffffff
        });
        o.renderOrder = 10;
        o.castShadow = false; // Cornea shouldn't block much light
      } else if (name.includes("iris") || name.includes("sclera")) {
        o.renderOrder = 1;
      }
    }
    if (o.name === "Eye_L") eyeL = o;
    if (o.name === "Eye_R") eyeR = o;
  });

  camera.lookAt(0, 0, 0);
  model.updateMatrixWorld(true);
});

// --- 6. Animation Loop ---
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
    updateUI("musclesL", actsL);
    updateUI("musclesR", actsR);

    const thr = 0.25;
    setCN(
      (actsL.MR > thr || actsL.SR > thr || actsL.IR > thr || actsL.IO > thr || actsR.MR > thr || actsR.SR > thr || actsR.IR > thr || actsR.IO > thr),
      (actsL.SO > thr || actsR.SO > thr),
      (actsL.LR > thr || actsR.LR > thr)
    );
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
