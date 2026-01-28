import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Set camera further back so the head isn't filling the whole screen
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 2.5); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
APP.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 2.5));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(1, 1.2, 1.2);
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
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5); 

let model = null, eyeL = null, eyeR = null;
const MAX_YAW = THREE.MathUtils.degToRad(30);
const MAX_PITCH = THREE.MathUtils.degToRad(20);
let yawSm = 0, pitchSm = 0;

// UI Building
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const makeMusclePanel = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  let html = "";
  MUSCLES.forEach(m => {
    html += `<div class="row"><div>${m}</div><div class="barWrap"><div class="bar" data-muscle="${m}"></div></div><div class="pct" data-pct="${m}">0%</div></div>`;
  });
  el.innerHTML = html;
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

  model.traverse(o => {
    // These names match your diagnostic log
    if (o.name === "Eye_L") eyeL = o;
    if (o.name === "Eye_R") eyeR = o;
    
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if(m.transparent) m.depthWrite = false; });
    }
  });

  // Manual Centering: Just place the head at the origin
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -center.y, -center.z);
  
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
    
    // Calculate angles (Assumes Z is forward)
    const yawVal = Math.atan2(localT.x, localT.z);
    const pitchVal = Math.atan2(-localT.y, localT.z);

    // Smoothing
    yawSm = THREE.MathUtils.lerp(yawSm, THREE.MathUtils.clamp(yawVal, -MAX_YAW, MAX_YAW), 0.1);
    pitchSm = THREE.MathUtils.lerp(pitchSm, THREE.MathUtils.clamp(pitchVal, -MAX_PITCH, MAX_PITCH), 0.1);

    // Apply to both eyes
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
