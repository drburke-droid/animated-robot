import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, currentActsL: null, currentActsR: null };
const uiCache = { left: {}, right: {}, cn: {} };

// --- 1. UI Initialization ---
function initUI() {
  const containerHUD = document.getElementById("hud-container");
  if (!containerHUD) return false;

  const sides = [
    { id: "musclesL", key: "left", label: "Right Eye (OD)" },
    { id: "musclesR", key: "right", label: "Left Eye (OS)" }
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

// --- 2. Anatomical Recruitment Logic ---
function getRecruitment(isRight, yaw, pitch) {
  const tone = 0.20; 
  const range = 1.6; // High sensitivity range

  const abduction = isRight ? yaw : -yaw; 
  const adduction = -abduction;

  const up = Math.max(0, pitch);
  const down = Math.max(0, -pitch);
  const outVal = Math.max(0, abduction);
  const inVal = Math.max(0, adduction);

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
document.getElementById("app").appendChild(renderer.domElement);

// Ambient Fill
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.8));

// CLINICAL LIGHTING: PointLight attached to target for corneal reflex
const cursorLight = new THREE.PointLight(0xffffff, 15, 10);
cursorLight.castShadow = true;
cursorLight.shadow.bias = -0.002;
scene.add(cursorLight);

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5); 
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  APP_STATE.hasPointer = true;
});

// --- 4. Loading ---
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
      o.castShadow = true; o.receiveShadow = true;
      if (o.name.toLowerCase().includes("cornea")) {
        // High specular material for the "Light Reflex"
        o.material = new THREE.MeshPhysicalMaterial({ 
            transmission: 1, 
            roughness: 0, 
            metalness: 0,
            ior: 1.33,
            opacity: 0.2, 
            transparent: true,
            thickness: 0.1
        });
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

// --- 5. Animation Loop ---
function animate() {
  if (!APP_STATE.ready) return;
  requestAnimationFrame(animate);
  
  if (APP_STATE.hasPointer) {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(gazePlane, targetVec);
    // Move the PointLight to follow the cursor target
    cursorLight.position.copy(targetVec);
  } else {
    targetVec.lerp(new THREE.Vector3(0, 0, 1), 0.05);
    cursorLight.position.copy(targetVec);
  }

  [ {mesh: eyeL, isRight: false, side: "left"}, {mesh: eyeR, isRight: true, side: "right"} ].forEach(item => {
    if (!item.mesh) return;
    const eyeWorldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(eyeWorldPos);
    const direction = new THREE.Vector3().subVectors(targetVec, eyeWorldPos).normalize();

    const yaw = Math.atan2(direction.x, direction.z) * 1.5; 
    const pitch = Math.asin(direction.y) * 1.5;

    const clampedYaw = THREE.MathUtils.clamp(yaw, -0.6, 0.6);
    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.4, 0.4);

    item.mesh.rotation.set(-clampedPitch, clampedYaw, 0, 'YXZ');
    const acts = getRecruitment(item.isRight, clampedYaw, clampedPitch);
    
    MUSCLES.forEach(m => {
      // DISPLAY FIX: Scale 0.7 to 100% UI, but cap text at 100%
      const rawVal = acts[m];
      const visualPct = THREE.MathUtils.clamp(rawVal / 0.7, 0, 1);
      const displayPct = THREE.MathUtils.clamp(Math.round((rawVal / 0.7) * 100), 0, 100);

      const cache = uiCache[item.side][m];
      cache.bar.style.width = (visualPct * 100) + "%";
      cache.pct.innerText = displayPct + "%";
    });

    if (item.isRight) APP_STATE.currentActsR = acts;
    else APP_STATE.currentActsL = acts;
  });

  const t = 0.28;
  const aL = APP_STATE.currentActsL; const aR = APP_STATE.currentActsR;
  if (aL && aR) {
    uiCache.cn.cn3.classList.toggle("on", aL.MR > t || aL.SR > t || aL.IR > t || aL.IO > t || aR.MR > t || aR.SR > t || aR.IR > t || aR.IO > t);
    uiCache.cn.cn4.classList.toggle("on", aL.SO > t || aR.SO > t);
    uiCache.cn.cn6.classList.toggle("on", aL.LR > t || aR.LR > t);
  }
  renderer.render(scene, camera);
}
