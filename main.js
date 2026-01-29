import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, currentActsL: null, currentActsR: null, zoom: 6.5 };
const uiCache = { left: {}, right: {}, cn: {} };

// --- 1. UI Initialization (Fixed Titles for Screen Sides) ---
function initUI() {
  const containerHUD = document.getElementById("hud-container");
  if (!containerHUD) return false;

  const sides = [
    { id: "musclesL", key: "left", label: "Left Eye (OS)" },  // Left screen side
    { id: "musclesR", key: "right", label: "Right Eye (OD)" } // Right screen side
  ];

  sides.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    el.innerHTML = `<div class="panel-title">${s.label}</div>`;
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="m-label">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`;
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

// --- 2. Anatomical Recruitment (The SO Mechanical Fix) ---
function getRecruitment(isRight, yaw, pitch) {
  const tone = 0.20; 
  const range = 1.6; 

  const abduction = isRight ? yaw : -yaw; 
  const adduction = -abduction;

  const up = Math.max(0, pitch);
  const down = Math.max(0, -pitch);
  const outVal = Math.max(0, abduction);
  const inVal = Math.max(0, adduction);

  // Mechanical leverage scaling
  const rectiEff = 0.2 + (outVal * 0.8); 
  const oblEff = 0.2 + (inVal * 0.8);

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
scene.background = new THREE.Color(0x020202);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, APP_STATE.zoom);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("app").appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.3));
const penlight = new THREE.PointLight(0xffffff, 80, 12);
penlight.castShadow = true;
penlight.shadow.bias = -0.0005; 
penlight.shadow.normalBias = 0.02; 
scene.add(penlight);

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5); 
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

// --- 4. Event Listeners ---
window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  APP_STATE.hasPointer = true;
});

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomStep = e.deltaY * 0.008;
  APP_STATE.zoom = THREE.MathUtils.clamp(APP_STATE.zoom + zoomStep, 3, 14);
  camera.position.z = APP_STATE.zoom;
}, { passive: false });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initUI();

// --- 5. Loader & Material Logic ---
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.8 / size.y;
  model.scale.setScalar(scale);

  // Position: centered eyes
  model.position.y = -1.6; 

  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.name.toLowerCase().includes("cornea")) {
        o.material = new THREE.MeshPhysicalMaterial({ 
          transmission: 1.0, roughness: 0, ior: 1.45, thickness: 0.1, 
          specularIntensity: 2.0, transparent: true, opacity: 1 
        });
        o.renderOrder = 10;
      }
      if (o.name.toLowerCase().includes("iris")) {
        o.material.roughness = 1; o.material.metalness = 0;
        o.material.emissive = new THREE.Color(0x111111);
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

// --- 6. Animation Loop ---
function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  
  if (APP_STATE.hasPointer) {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(gazePlane, targetVec);
    penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6);
  } else {
    targetVec.lerp(new THREE.Vector3(0, 0, 1), 0.05);
    penlight.position.copy(targetVec);
  }

  // Data Pipe mapping: 
  // eyeL (subject's left) maps to the 'left' HUD cache (screen left)
  // eyeR (subject's right) maps to the 'right' HUD cache (screen right)
  const configs = [
    { mesh: eyeL, isRight: false, side: "left" }, 
    { mesh: eyeR, isRight: true, side: "right" }
  ];

  configs.forEach(item => {
    if (!item.mesh) return;
    const eyeWorldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(eyeWorldPos);
    const direction = new THREE.Vector3().subVectors(targetVec, eyeWorldPos).normalize();
    const yaw = Math.atan2(direction.x, direction.z);
    const pitch = Math.asin(direction.y);

    const cYaw = THREE.MathUtils.clamp(yaw, -0.6, 0.6);
    const cPitch = THREE.MathUtils.clamp(pitch, -0.4, 0.4);
    item.mesh.rotation.set(-cPitch, cYaw, 0, 'YXZ');
    
    const acts = getRecruitment(item.isRight, cYaw, cPitch);
    MUSCLES.forEach(m => {
      const visualVal = THREE.MathUtils.clamp(acts[m] / 0.7, 0, 1);
      const displayVal = THREE.MathUtils.clamp(Math.round((acts[m] / 0.7) * 100), 0, 100);
      
      const cache = uiCache[item.side][m];
      if(cache) {
        cache.bar.style.width = (visualVal * 100) + "%";
        cache.pct.innerText = displayVal + "%";
      }
    });

    if (item.isRight) APP_STATE.currentActsR = acts;
    else APP_STATE.currentActsL = acts;
  });

  const t = 0.28;
  const aL = APP_STATE.currentActsL; const aR = APP_STATE.currentActsR;
  if (aL && aR) {
    if(uiCache.cn.cn3) uiCache.cn.cn3.classList.toggle("on", aL.MR > t || aL.SR > t || aL.IR > t || aL.IO > t || aR.MR > t || aR.SR > t || aR.IR > t || aR.IO > t);
    if(uiCache.cn.cn4) uiCache.cn.cn4.classList.toggle("on", aL.SO > t || aR.SO > t);
    if(uiCache.cn.cn6) uiCache.cn.cn6.classList.toggle("on", aL.LR > t || aR.LR > t);
  }
  renderer.render(scene, camera);
}
