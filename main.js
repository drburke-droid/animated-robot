import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const uiRef = { left: {}, right: {}, pills: {} };

/** * 1. UI SETUP: Build the bars once and store references in memory.
 */
const initUI = () => {
  ["L", "R"].forEach(side => {
    const container = document.getElementById(`muscles${side}`);
    const key = side === "L" ? "left" : "right";
    MUSCLES.forEach(m => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="label">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">20%</div>`;
      container.appendChild(row);
      uiRef[key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") };
    });
  });
  uiRef.pills = { cn3: document.getElementById("cn3"), cn4: document.getElementById("cn4"), cn6: document.getElementById("cn6") };
};

/**
 * 2. ANATOMICAL LOGIC: 
 * Based on the H-test, calculating mechanical advantage.
 */
function calculateEngagement(isRight, yaw, pitch) {
  const basal = 0.20; // 20% resting tone
  const targetYaw = yaw * (isRight ? 1 : -1); // Positive = Abduction
  
  // Horizontal Recruitment
  let lr = basal + Math.max(0, targetYaw);
  let mr = basal + Math.max(0, -targetYaw);

  // Vertical Efficiency Factors
  // Recti are primary movers when eye is Abducted (looking out)
  const rectiEff = 0.5 + (Math.max(0, targetYaw) * 0.5);
  // Obliques are primary movers when eye is Adducted (looking in)
  const oblEff = 0.5 + (Math.max(0, -targetYaw) * 0.5);

  return {
    LR: lr,
    MR: mr,
    SR: basal + (Math.max(0, pitch) * rectiEff),
    IR: basal + (Math.max(0, -pitch) * rectiEff),
    IO: basal + (Math.max(0, pitch) * oblEff),
    SO: basal + (Math.max(0, -pitch) * oblEff)
  };
}

/**
 * 3. THREE.JS SCENE SETUP
 */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("app").appendChild(renderer.domElement);

// Lighting - High quality, low acne
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 2));
const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(5, 5, 5);
key.castShadow = true;
key.shadow.bias = -0.001; 
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);
const targetVec = new THREE.Vector3();
let model, eyeL, eyeR;

window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

/**
 * 4. LOAD & NORMALIZE
 */
initUI();
new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  const scale = 2.0 / size.y;
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
  animate();
});

/**
 * 5. ANIMATION LOOP (Optimized)
 */
function animate() {
  requestAnimationFrame(animate);
  
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(gazePlane, targetVec);

  const yaw = THREE.MathUtils.clamp(Math.atan2(targetVec.x, 3), -0.5, 0.5);
  const pitch = THREE.MathUtils.clamp(Math.atan2(-targetVec.y, 3), -0.3, 0.3);

  if (eyeL && eyeR) {
    eyeL.rotation.set(pitch, yaw, 0, 'YXZ');
    eyeR.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // Update UI Elements directly from cache
  const actsL = calculateEngagement(false, yaw, pitch);
  const actsR = calculateEngagement(true, yaw, pitch);

  [ {a: actsL, s: "left"}, {a: actsR, s: "right"} ].forEach(group => {
    MUSCLES.forEach(m => {
      const val = THREE.MathUtils.clamp(group.a[m], 0, 1);
      const ui = uiRef[group.s][m];
      ui.bar.style.width = (val * 100) + "%";
      ui.pct.innerText = Math.round(val * 100) + "%";
    });
  });

  // Nerve Logic
  const t = 0.25;
  uiRef.pills.cn3.classList.toggle("on", actsL.MR > t || actsL.SR > t || actsL.IR > t || actsL.IO > t || actsR.MR > t || actsR.SR > t || actsR.IR > t || actsR.IO > t);
  uiRef.pills.cn4.classList.toggle("on", actsL.SO > t || actsR.SO > t);
  uiRef.pills.cn6.classList.toggle("on", actsL.LR > t || actsR.LR > t);

  renderer.render(scene, camera);
}
