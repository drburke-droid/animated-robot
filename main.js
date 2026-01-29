import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, currentActsL: null, currentActsR: null };
const uiCache = { left: {}, right: {}, cn: {} };

// --- 1. UI Initialization (Fixed Mapping) ---
function initUI() {
  const containerHUD = document.getElementById("hud-container");
  if (!containerHUD) return false;

  // Mirroring logic:
  // musclesR (Person's Right Eye) -> physically on the LEFT of screen
  // musclesL (Person's Left Eye) -> physically on the RIGHT of screen
  const sides = [
    { id: "musclesR", key: "right", label: "Right Eye (OD)" },
    { id: "musclesL", key: "left", label: "Left Eye (OS)" }
  ];

  sides.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="m-label">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">20%</div>`;
      el.appendChild(row);
      uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });

  uiCache.cn.cn3 = document.getElementById("cn3");
  uiCache.cn.cn4 = document.getElementById("cn4");
  uiCache.cn.cn6 = document.getElementById("cn6");
  containerHUD.style.opacity = "1";
  return true;
}

// --- 2. Anatomical Logic ---
function getRecruitment(isRight, yaw, pitch) {
  const tone = 0.20; 
  const range = 0.80; 

  // Normalize abduction: Positive = looking away from nose
  // If isRight=true, positive yaw is Abduction. If isRight=false, negative yaw is Abduction.
  const abduction = isRight ? yaw : -yaw; 
  const adduction = -abduction;

  const up = Math.max(0, pitch);
  const down = Math.max(0, -pitch);
  const outVal = Math.max(0, abduction);
  const inVal = Math.max(0, adduction);

  // Mechanical Advantage: Recti optimal at ~23deg out, Obliques at ~51deg in
  const rectiEff = 0.4 + (outVal * 0.6); 
  const oblEff = 0.4 + (inVal * 0.6);

  return {
    LR: tone + (outVal * range),
    MR: tone + (inVal * range),
    SR: tone + (up * rectiEff * range),   
    IR: tone + (down * rectiEff * range), 
    IO: tone + (up * oblEff * range),     
    SO: tone + (down * oblEff * range)    
  };
}

// --- 3. Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
// FIX: Moved plane back to -2.0. -0.5 was too close, causing "crazy eyes".
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.0); 
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(5, 5, 5);
keyLight.castShadow = true;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  APP_STATE.hasPointer = true;
});

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("app").appendChild(renderer.domElement);
  initUI();
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
          o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, opacity: 0.15, transparent: true });
          o.renderOrder = 10;
        }
      }
      if (o.name === "Eye_L") eyeL = o;
      if (o.name === "Eye_R") eyeR = o;
    });
    scene.add(model);
    document.getElementById("loading").style.display = "none";
    APP_STATE.ready = true;
    animate();
  });
});

// --- 4. Loop ---
function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  
  if (APP_STATE.hasPointer) {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(gazePlane, targetVec);
  } else {
    targetVec.lerp(new THREE.Vector3(0, 0, 1), 0.05);
  }

  // Define eyes explicitly to map OD (Right Eye) data to the OD Box
  const eyeConfigs = [
    { mesh: eyeL, isRight: false, side: "left" }, // OS
    { mesh: eyeR, isRight: true, side: "right" }  // OD
  ];

  eyeConfigs.forEach(item => {
    if (!item.mesh) return;
    const eyeWorldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(eyeWorldPos);
    
    // Calculate direction from this specific eye to the mouse
    const direction = new THREE.Vector3().subVectors(targetVec, eyeWorldPos).normalize();

    // atan2 sensitivity boost. Clamp rotation to prevent "rolling back" into head
    let yaw = Math.atan2(direction.x, direction.z);
    let pitch = Math.asin(direction.y);

    // Hard anatomical limit (approx 35 degrees)
    yaw = THREE.MathUtils.clamp(yaw, -0.6, 0.6);
    pitch = THREE.MathUtils.clamp(pitch, -0.4, 0.4);

    item.mesh.rotation.set(-pitch, yaw, 0, 'YXZ');
    
    // Use the yaw/pitch relative to the face, not the screen
    const acts = getRecruitment(item.isRight, yaw, pitch);
    
    MUSCLES.forEach(m => {
      const v = THREE.MathUtils.clamp(acts[m], 0, 1);
      const cache = uiCache[item.side][m];
      cache.bar.style.width = (v * 100) + "%";
      cache.pct.innerText = Math.round(v * 100) + "%";
    });

    if (item.isRight) APP_STATE.currentActsR = acts;
    else APP_STATE.currentActsL = acts;
  });

  // Nerve Activation Status
  const t = 0.28;
  const aL = APP_STATE.currentActsL; 
  const aR = APP_STATE.currentActsR;
  if (aL && aR) {
    uiCache.cn.cn3.classList.toggle("on", aL.MR > t || aL.SR > t || aL.IR > t || aL.IO > t || aR.MR > t || aR.SR > t || aR.IR > t || aR.IO > t);
    uiCache.cn.cn4.classList.toggle("on", aL.SO > t || aR.SO > t);
    uiCache.cn.cn6.classList.toggle("on", aL.LR > t || aR.LR > t);
  }
  renderer.render(scene, camera);
}
