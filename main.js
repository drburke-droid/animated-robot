import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera at a safe distance
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 5); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
APP.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 2.5));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(2, 2, 5);
scene.add(key);

// Interaction
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
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1); 

let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(25);
const MAX_PITCH = THREE.MathUtils.degToRad(15);
let yawSm = 0, pitchSm = 0;

// UI 
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const makeMusclePanel = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  MUSCLES.forEach(m => {
    el.innerHTML += `<div class="row"><div>${m}</div><div class="barWrap"><div class="bar" data-muscle="${m}"></div></div><div class="pct" data-pct="${m}">0%</div></div>`;
  });
};
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

function getMuscleActs(isRight, yNorm, pNorm) {
  const r = Math.max(0, yNorm), l = Math.max(0, -yNorm);
  const u = Math.max(0, pNorm), d = Math.max(0, -pNorm);
  return { LR: isRight ? r : l, MR: isRight ? l : r, SR: u * 0.8, IR: d * 0.8, SO: d * 0.5, IO: u * 0.5 };
}

// Load GLB
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  scene.add(model);

  // 1. NORMALIZE SCALE AND POSITION
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Rescale model to fit in a 2x2x2 cube
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2 / maxDim;
  model.scale.setScalar(scale);

  // Reposition so the center of the head is at (0,0,0)
  model.position.x = -center.x * scale;
  model.position.y = -center.y * scale;
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

function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      raycaster.ray.intersectPlane(gazePlane, target);
    } else {
      target.lerp(new THREE.Vector3(0, 0, 1), 0.05);
    }

    // World to Local math for Eye L
    const localT = new THREE.Vector3().copy(target);
    eyeL.worldToLocal(localT);
    
    const yawVal = Math.atan2(localT.x, localT.z);
    const pitchVal = Math.atan2(-localT.y, localT.z);

    yawSm = THREE.MathUtils.lerp(yawSm, THREE.MathUtils.clamp(yawVal, -MAX_YAW, MAX_YAW), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, THREE.MathUtils.clamp(pitchVal, -MAX_PITCH, MAX_PITCH), 0.1);

    eyeL.rotation.set(pitchSm, yawSm, 0, 'YXZ');
    eyeR.rotation.set(pitchSm, yawSm, 0, 'YXZ');

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
