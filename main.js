import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const APP = document.getElementById("app");
// ... rest of your code stays the same

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 0.05, 0.55);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
APP.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 2.0);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(1, 1.2, 1.2);
scene.add(key);

// Mouse to target point
const mouseNDC = new THREE.Vector2(0, 0);
let hasPointer = false;

function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  mouseNDC.set(x, y);
  hasPointer = true;
}

window.addEventListener("pointermove", setPointerFromEvent, { passive: true });
window.addEventListener("pointerleave", () => { hasPointer = false; }, { passive: true });

// Invisible plane in front of face to place the gaze target
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.15);
const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3(0, 0.05, 0.15);

// Model and eyes
let model = null;
let eyeL = null;
let eyeR = null;

// Helpers
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Eye axis conventions (per your Blender file)
// Eye forward is local -Y
// yaw = rotation around local Z
// pitch = rotation around local X
const MAX_YAW_DEG = 30;
const MAX_PITCH_DEG = 20;
const MAX_YAW = THREE.MathUtils.degToRad(MAX_YAW_DEG);
const MAX_PITCH = THREE.MathUtils.degToRad(MAX_PITCH_DEG);

let yawSm = 0;
let pitchSm = 0;

// UI builders
const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];

function makeMusclePanel(el) {
  for (const m of MUSCLES) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>${m}</div>
      <div class="barWrap"><div class="bar" data-muscle="${m}"></div></div>
      <div class="pct" data-pct="${m}">0%</div>
    `;
    el.appendChild(row);
  }
}

makeMusclePanel(document.getElementById("musclesL"));
makeMusclePanel(document.getElementById("musclesR"));

function setBars(panelId, acts) {
  const panel = document.getElementById(panelId);
  for (const m of MUSCLES) {
    const bar = panel.querySelector(`.bar[data-muscle="${m}"]`);
    const pct = panel.querySelector(`.pct[data-pct="${m}"]`);
    const v = clamp(acts[m] ?? 0, 0, 1);
    bar.style.width = `${Math.round(v * 100)}%`;
    pct.textContent = `${Math.round(v * 100)}%`;
  }
}

function setCN(cn3, cn4, cn6) {
  document.getElementById("cn3").classList.toggle("on", cn3);
  document.getElementById("cn4").classList.toggle("on", cn4);
  document.getElementById("cn6").classList.toggle("on", cn6);
}

// Recruitment estimate from yaw/pitch
// yawNorm: [-1,1], + = gaze to subject's right
// pitchNorm: [-1,1], + = gaze up
function muscleEstimateForEye(isRightEye, yawNorm, pitchNorm) {
  const right = Math.max(0, yawNorm);
  const left = Math.max(0, -yawNorm);
  const up = Math.max(0, pitchNorm);
  const down = Math.max(0, -pitchNorm);

  let LR = 0, MR = 0;
  if (isRightEye) { LR = right; MR = left; }
  else { LR = left; MR = right; }

  const SR = up * 0.7;
  const IO = up * 0.7;
  const IR = down * 0.7;
  const SO = down * 0.7;

  return { LR, MR, SR, IR, SO, IO };
}

function cnFromMuscles(actsL, actsR) {
  const thr = 0.05;
  const any = (obj, keys) => keys.some(k => (obj[k] ?? 0) > thr);
  const cn3 = any(actsL, ["MR", "SR", "IR", "IO"]) || any(actsR, ["MR", "SR", "IR", "IO"]);
  const cn4 = (actsL.SO ?? 0) > thr || (actsR.SO ?? 0) > thr;
  const cn6 = (actsL.LR ?? 0) > thr || (actsR.LR ?? 0) > thr;
  return { cn3, cn4, cn6 };
}

// Load GLB
const loader = new GLTFLoader();

console.log("loading GLB...");

loader.load(
  "./head_eyes_v1.glb",
  (gltf) => {
    console.log("GLB loaded");

    model = gltf.scene;
    scene.add(model);

    // Print node names once so you can confirm Eye_L / Eye_R naming
    model.traverse((o) => { if (o.name) console.log("node:", o.name); });

    // Improve transparency layering for cornea (common WebGL issue)
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && m.transparent) {
            m.depthWrite = false;
          }
        }
      }
    });

    // Auto-frame model so it is visible regardless of scale/position
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let camZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    camZ *= 1.4;

    camera.position.set(0, 0.05, camZ);
    camera.lookAt(0, 0.05, 0);

    camera.near = camZ / 100;
    camera.far = camZ * 100;
    camera.updateProjectionMatrix();

    // Find eyes by name
    eyeL = model.getObjectByName("Eye_L");
    eyeR = model.getObjectByName("Eye_L001");

    if (!eyeL || !eyeR) {
      console.error("Could not find Eye_L / Eye_R. Use the printed node list to match names.");
      return;
    }
  },
  undefined,
  (err) => {
    console.error("GLB load failed", err);
  }
);

// Animate
function animate() {
  requestAnimationFrame(animate);

  if (model && eyeL && eyeR) {
    if (hasPointer) {
      raycaster.setFromCamera(mouseNDC, camera);
      const hit = raycaster.ray.intersectPlane(gazePlane, target);
      if (!hit) target.set(0, 0.05, 0.15);
    } else {
      target.set(0, 0.05, 0.15);
    }

    // Compute desired yaw/pitch in Eye_L local coordinates (conjugate gaze)
    const tmp = new THREE.Vector3();
    eyeL.updateMatrixWorld(true);
    tmp.copy(target);
    eyeL.worldToLocal(tmp);

    const dx = tmp.x;
    const dy = tmp.y;
    const dz = tmp.z;

    const yawDes = Math.atan2(dx, -dy);
    const pitchDes = Math.atan2(dz, -dy);

    const yawCl = clamp(yawDes, -MAX_YAW, MAX_YAW);
    const pitchCl = clamp(pitchDes, -MAX_PITCH, MAX_PITCH);

    const smooth = 0.18;
    yawSm = lerp(yawSm, yawCl, smooth);
    pitchSm = lerp(pitchSm, pitchCl, smooth);

    // Apply to both eyes
    eyeL.rotation.z = yawSm;
    eyeL.rotation.x = pitchSm;
    eyeR.rotation.z = yawSm;
    eyeR.rotation.x = pitchSm;

    // Overlays
    const yawNorm = yawSm / MAX_YAW;
    const pitchNorm = pitchSm / MAX_PITCH;

    const actsL = muscleEstimateForEye(false, yawNorm, pitchNorm);
    const actsR = muscleEstimateForEye(true, yawNorm, pitchNorm);

    setBars("musclesL", actsL);
    setBars("musclesR", actsR);

    const cn = cnFromMuscles(actsL, actsR);
    setCN(cn.cn3, cn.cn4, cn.cn6);
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener(
  "resize",
  () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  { passive: true }
);



