import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false };
const uiCache = { left: {}, right: {}, cn: {} };

// --- 1. UI Initialization ---
function initUI() {
  const containerHUD = document.getElementById("hud-container");
  if (!containerHUD) return false;

  const sides = [
    { id: "musclesL", key: "left", label: "Left Eye (OS)" },
    { id: "musclesR", key: "right", label: "Right Eye (OD)" }
  ];

  sides.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
    
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="m-label">${m}</div>
        <div class="barWrap"><div class="bar"></div></div>
        <div class="pct">20%</div>`;
      el.appendChild(row);
      
      uiCache[s.key][m] = {
        bar: row.querySelector(".bar"),
        pct: row.querySelector(".pct")
      };
    });
  });

  uiCache.cn.cn3 = document.getElementById("cn3");
  uiCache.cn.cn4 = document.getElementById("cn4");
  uiCache.cn.cn6 = document.getElementById("cn6");

  // Safety check: reveal HUD only if all elements were found
  containerHUD.style.opacity = "1";
  return true;
}

// --- 2. Anatomical Logic (High Accuracy) ---
function getRecruitment(isRight, yaw, pitch) {
  const tone = 0.20; 
  const range = 0.80; 

  // Subject Gaze Perspective:
  // Right Eye: Positive yaw = Abduction (LR), Negative yaw = Adduction (MR)
  // Left Eye: Positive yaw = Adduction (MR), Negative yaw = Abduction (LR)
  const abduction = isRight ? yaw : -yaw; 
  
  // Vertical Sign Correction:
  // Mouse UP -> Positive pitch. Mouse DOWN -> Negative pitch.
  const up = Math.max(0, pitch);
  const down = Math.max(0, -pitch);
  const gazeOut = Math.max(0, abduction);
  const gazeIn = Math.max(0, -abduction);

  // Efficiency scaling (H-test Mechanics)
  const rectiEff = 0.4 + (gazeOut * 0.6); 
  const oblEff = 0.4 + (gazeIn * 0.6);

  return {
    LR: tone + (gazeOut * range),
    MR: tone + (gazeIn * range),
    SR: tone + (up * rectiEff * range),   // Elevates in Abduction
    IR: tone + (down * rectiEff * range), // Depresses in Abduction
    IO: tone + (up * oblEff * range),     // Elevates in Adduction
    SO: tone + (down * oblEff * range)    // Depresses in Adduction
  };
}

// --- 3. Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById("app").appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(5, 5, 5);
keyLight.castShadow = true;
keyLight.shadow.bias = -0.001; 
scene.add(keyLight);

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  APP_STATE.hasPointer = true;
});

// --- 4. Main Loader ---
if (initUI()) {
  new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
    model = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.8 / size.y;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -center.y * scale - 0.2, -center.z * scale);
    
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        if (o.name.toLowerCase().includes("cornea")) {
          o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, opacity: 0.1, transparent: true });
          o.renderOrder = 10;
        }
      }
      if (o.name === "Eye_L") eyeL = o;
      if (o.name === "Eye_R") eyeR = o;
    });

    scene.add(model);
    const loadEl = document.getElementById("loading");
    if (loadEl) loadEl.style.display = "none";
    APP_STATE.ready = true;
    animate();
  });
}

// --- 5. Corrected Animation Loop ---
function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  
  if (APP_STATE.hasPointer) {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(gazePlane, targetVec);
  } else {
    targetVec.lerp(new THREE.Vector3(0, 0, 2), 0.05);
  }

  // SENSITIVITY: Lower numbers = Higher sensitivity
  const yaw = THREE.MathUtils.clamp(Math.atan2(targetVec.x, 1.8), -0.6, 0.6);
  const pitch = THREE.MathUtils.clamp(Math.atan2(targetVec.y, 1.2), -0.4, 0.4); 

  if (eyeL && eyeR) {
    // Pitch is inverted in rotation because positive X tilts DOWN
    eyeL.rotation.set(-pitch, yaw, 0, 'YXZ');
    eyeR.rotation.set(-pitch, yaw, 0, 'YXZ');
  }

  const actsL = getRecruitment(false, yaw, pitch);
  const actsR = getRecruitment(true, yaw, pitch);

  // Smoothly update UI elements
  [ {data: actsL, side: "left"}, {data: actsR, side: "right"} ].forEach(obj => {
    MUSCLES.forEach(m => {
      const v = THREE.MathUtils.clamp(obj.data[m], 0, 1);
      const cache = uiCache[obj.side][m];
      if (cache) {
        cache.bar.style.width = (v * 100) + "%";
        cache.pct.innerText = Math.round(v * 100) + "%";
      }
    });
  });

  const t = 0.26;
  if (uiCache.cn.cn3) uiCache.cn.cn3.classList.toggle("on", actsL.MR > t || actsL.SR > t || actsL.IR > t || actsL.IO > t || actsR.MR > t || actsR.SR > t || actsR.IR > t || actsR.IO > t);
  if (uiCache.cn.cn4) uiCache.cn.cn4.classList.toggle("on", actsL.SO > t || actsR.SO > t);
  if (uiCache.cn.cn6) uiCache.cn.cn6.classList.toggle("on", actsL.LR > t || actsR.LR > t);

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
