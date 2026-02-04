import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

[cite_start]const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"]; [cite: 2]
[cite_start]const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5, headTilt: 0 }; [cite: 2]
[cite_start]const uiCache = { left: {}, right: {} }; [cite: 3]

const SYSTEM_STATE = {
  [cite_start]nerves: { "R-CN3": 1, "R-CN4": 1, "R-CN6": 1, "L-CN3": 1, "L-CN4": 1, "L-CN6": 1 }, [cite: 3]
  muscles: { 
    [cite_start]right: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 }, [cite: 3]
    [cite_start]left: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 } [cite: 3]
  }
};

const PATHOLOGIES = {
  [cite_start]"CN III Palsy": { s: ['R', 'L', 'B'], prev: "0.4", desc: "Oculomotor nerve palsy. Causes a 'down-and-out' eye position, ptosis (eyelid droop), and potentially a dilated pupil.", f: (side) => setNerve(side, 3, 0) }, [cite: 4]
  [cite_start]"CN IV Palsy": { s: ['R', 'L', 'B'], prev: "0.5", desc: "Trochlear nerve palsy affecting the Superior Oblique muscle. Causes vertical double vision and an upward drift (hypertropia).", f: (side) => setNerve(side, 4, 0) }, [cite: 4]
  [cite_start]"CN VI Palsy": { s: ['R', 'L', 'B'], prev: "1.1", desc: "Abducens nerve palsy. Blocks outward movement (abduction) and causes the eye to drift inward (esotropia).", f: (side) => setNerve(side, 6, 0) }, [cite: 4, 5]
  "INO (MLF)": { s: ['R', 'L', 'B'], prev: "0.3", desc: "Internuclear Ophthalmoplegia. Damage to the Medial Longitudinal Fasciculus (MLF). The eye on the side of the lesion cannot turn inward (adduct) during horizontal gaze.", f: (side) => {
    [cite_start]if(side==='right'||side==='both') SYSTEM_STATE.muscles.right.MR = 0; [cite: 5]
    [cite_start]if(side==='left'||side==='both') SYSTEM_STATE.muscles.left.MR = 0; [cite: 6]
  }},
  "Graves (TED)": { s: ['R', 'L', 'B'], prev: "2.5", desc: "Thyroid Eye Disease. An autoimmune swelling of the muscles. Typically restricts the Inferior Rectus and Medial Rectus first.", f: (side) => {
    const t = side === 'both' ? [cite_start]['right','left'] : [side]; [cite: 6, 7]
    [cite_start]t.forEach(s => { SYSTEM_STATE.muscles[s].IR = 0.3; SYSTEM_STATE.muscles[s].MR = 0.5; }); [cite: 7]
  }},
  "Blowout Fx": { s: ['R', 'L'], prev: "0.8", desc: "Orbital floor fracture. The Inferior Rectus muscle becomes physically trapped in the bone, preventing upward gaze.", f: (side) => { SYSTEM_STATE.muscles[side].IR = 0; [cite_start]}}, [cite: 8]
  "Brown Syn.": { s: ['R', 'L'], prev: "0.2", desc: "Mechanical restriction of the Superior Oblique tendon. Prevents the eye from looking up when it is turned inward toward the nose.", f: (side) => { SYSTEM_STATE.muscles[side].IO = 0; [cite_start]}}, [cite: 9]
  "Myasthenia": { s: ['B'], prev: "2.0", desc: "Myasthenia Gravis. An autoimmune breakdown of communication between nerves and muscles. Characterized by fluctuating fatigue and weakness.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.4); [cite_start]}}, [cite: 10]
  "Parinaud": { s: ['B'], prev: "0.1", desc: "Dorsal Midbrain Syndrome. Often caused by pineal gland tumors. Prevents upward gaze and causes convergence-retraction nystagmus.", f: () => { ['right','left'].forEach(s => { SYSTEM_STATE.muscles[s].SR = 0; SYSTEM_STATE.muscles[s].IO = 0; }); [cite_start]}}, [cite: 11]
  "Miller Fisher": { s: ['B'], prev: "0.05", desc: "A rare variant of Guillain-Barré Syndrome (GBS). Causes acute, symmetrical paralysis of all eye movements and loss of reflexes.", f: () => { Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 0.1); [cite_start]}}, [cite: 12]
  "Wallenberg": { s: ['R', 'L'], prev: "0.2", desc: "Lateral Medullary Syndrome (PICA Artery stroke). Causes skew deviation (one eye sits higher), Horner's syndrome, and balance loss.", f: (side) => { 
    [cite_start]const isR = side === 'right'; [cite: 13]
    [cite_start]SYSTEM_STATE.muscles[isR?'right':'left'].IR = 0.5; [cite: 14]
    [cite_start]SYSTEM_STATE.muscles[isR?'left':'right'].SR = 0.5; [cite: 14]
  }},
  "AICA Stroke": { s: ['R', 'L'], prev: "0.1", desc: "Anterior Inferior Cerebellar Artery stroke. Often involves the CN VI nucleus and CN VII (facial) nerve, causing total gaze palsy to one side.", f: (side) => { setNerve(side, 6, 0); [cite_start]}}, [cite: 14, 15]
  [cite_start]"Foville Syn.": { s: ['R', 'L'], prev: "0.05", desc: "Brainstem lesion (Pons). Causes a combination of CN VI palsy, CN VII palsy (facial droop), and a loss of all horizontal gaze toward the lesion.", f: (side) => { setNerve(side, 6, 0); [cite: 15]
  setNerve(side, 3, 0.5); [cite_start]}}, [cite: 16]
  "Weber Syn.": { s: ['R', 'L'], prev: "0.1", desc: "Midbrain stroke. Causes a CN III palsy on the side of the stroke and weakness on the opposite side of the body.", f: (side) => { setNerve(side, 3, 0); [cite_start]}}, [cite: 16, 17]
  "Bielschowsky": { s: ['R', 'L'], prev: "0.5", desc: "Clinical sign of a CN IV (Trochlear) palsy. The upward drift of the eye worsens when the head is tilted toward the side of the palsy.", f: (side) => { setNerve(side, 4, 0); [cite_start]}}, [cite: 17, 18]
  "One-and-a-Half": { s: ['R', 'L'], prev: "0.1", desc: "Complex brainstem lesion. One eye is completely fixed horizontally; the other eye can only move outward (abduct).", f: (side) => {
    [cite_start]const isR = side === 'right'; [cite: 18]
    [cite_start]setNerve(side, 6, 0); [cite: 19]
    [cite_start]SYSTEM_STATE.muscles.right.MR = 0; [cite: 19]
    [cite_start]SYSTEM_STATE.muscles.left.MR = 0; [cite: 19]
  }}
};

[cite_start]let activePathName = null; [cite: 19]
[cite_start]const tooltip = document.getElementById('tooltip'); [cite: 19]

function setNerve(side, num, val) {
  if(side === 'both') { SYSTEM_STATE.nerves['R-CN'+num] = val; SYSTEM_STATE.nerves['L-CN'+num] = val; [cite_start]} [cite: 20]
  else { SYSTEM_STATE.nerves[(side==='right'?'R':'L')+'-CN'+num] = val; [cite_start]} [cite: 21]
}

window.resetSystem = () => {
  [cite_start]Object.keys(SYSTEM_STATE.nerves).forEach(k => SYSTEM_STATE.nerves[k] = 1); [cite: 21]
  [cite_start]['right','left'].forEach(s => MUSCLES.forEach(m => SYSTEM_STATE.muscles[s][m] = 1)); [cite: 22]
  [cite_start]updateUIStyles(); [cite: 22]
};

window.toggleState = (id, side = null, m = null) => {
  let cur = m ? [cite_start]SYSTEM_STATE.muscles[side][m] : SYSTEM_STATE.nerves[id]; [cite: 22, 23]
  let next = cur === 1 ? [cite_start]0.5 : (cur === 0.5 ? 0 : 1); [cite: 23]
  [cite_start]if (m) SYSTEM_STATE.muscles[side][m] = next; else SYSTEM_STATE.nerves[id] = next; [cite: 24]
  [cite_start]updateUIStyles(); [cite: 24]
};

[cite_start]window.closeModal = () => document.getElementById('side-modal').style.display = 'none'; [cite: 24]

window.applyPathology = (side) => {
  [cite_start]resetSystem(); [cite: 25]
  [cite_start]PATHOLOGIES[activePathName].f(side); [cite: 25]
  [cite_start]updateUIStyles(); [cite: 25]
  [cite_start]closeModal(); [cite: 25]
};

function updateUIStyles() {
  Object.entries(SYSTEM_STATE.nerves).forEach(([id, v]) => {
    [cite_start]const el = document.getElementById(id); if(!el) return; [cite: 26]
    [cite_start]el.className = 'pill clickable' + (v === 0.5 ? ' paresis' : (v === 0 ? ' paralysis' : '')); [cite: 26]
  });
  ['left','right'].forEach(s => {
    [cite_start]const sideKey = s === 'left' ? 'L' : 'R'; [cite: 27]
    MUSCLES.forEach(m => {
      [cite_start]const v = SYSTEM_STATE.muscles[s][m]; [cite: 27]
      [cite_start]const el = document.querySelector(`#muscles${sideKey} .m-label-${m}`); [cite: 27]
      [cite_start]if(el) el.className = `m-label clickable m-label-${m}` + (v===0.5?' paresis':(v===0?' paralysis':'')); [cite: 27]
    });
  });
}

function initUI() {
  [cite_start]const sides = [{ id: "musclesR", key: "right", label: "Right Eye (OD)" }, { id: "musclesL", key: "left", label: "Left Eye (OS)" }]; [cite: 28]
  sides.forEach(s => {
    [cite_start]const el = document.getElementById(s.id); [cite: 29]
    [cite_start]el.innerHTML = `<div style="color:#4cc9f0; font-size:12px; font-weight:900; margin-bottom:10px;">${s.label}</div>`; [cite: 29]
    MUSCLES.forEach(m => {
      [cite_start]const row = document.createElement("div"); row.className = "row"; [cite: 29]
      [cite_start]row.innerHTML = `<div class="m-label clickable m-label-${m}" onclick="toggleState(null, '${s.key}', '${m}')">${m}</div><div class="barWrap"><div class="bar"></div></div><div class="pct">0%</div>`; [cite: 29]
      [cite_start]el.appendChild(row); [cite: 29]
      [cite_start]uiCache[s.key][m] = { bar: row.querySelector(".bar"), pct: row.querySelector(".pct") }; [cite: 29]
    });
  });

  [cite_start]const grid = document.getElementById('pathology-grid'); [cite: 30]
  Object.keys(PATHOLOGIES).forEach(name => {
    [cite_start]const btn = document.createElement('div'); btn.className = 'pill clickable'; btn.innerText = name; [cite: 30]
    btn.onmouseover = (e) => {
      [cite_start]const p = PATHOLOGIES[name]; [cite: 30]
      [cite_start]tooltip.innerHTML = `<div class="tt-title">${name}</div><div class="tt-stat">Prev: ~${p.prev}/10k patients</div><div>${p.desc}</div>`; [cite: 30]
      [cite_start]tooltip.style.display = 'block'; [cite: 30]
      [cite_start]tooltip.style.left = e.pageX + 10 + 'px'; tooltip.style.top = e.pageY + 10 + 'px'; [cite: 30]
    };
    [cite_start]btn.onmouseout = () => tooltip.style.display = 'none'; [cite: 30]
    btn.onclick = () => {
      [cite_start]activePathName = name; [cite: 31]
      [cite_start]document.getElementById('side-modal').style.display = 'flex'; [cite: 31]
      [cite_start]['R','B','L'].forEach(c => document.getElementById('btn-side-'+c).style.display = PATHOLOGIES[name].s.includes(c)?'block':'none'); [cite: 31]
    };
    [cite_start]grid.appendChild(btn); [cite: 31]
  });
  [cite_start]document.getElementById("hud-container").style.opacity = "1"; [cite: 32]
  [cite_start]document.getElementById("tiltSlider").oninput = (e) => APP_STATE.headTilt = THREE.MathUtils.degToRad(e.target.value); [cite: 32]
}

function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? [cite_start]'right' : 'left'; [cite: 33]
  const prefix = isRight ? [cite_start]'R-' : 'L-'; [cite: 33, 34]
  const h = {
    [cite_start]LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR, [cite: 34]
    [cite_start]MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR, [cite: 34]
    [cite_start]SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR, [cite: 34]
    [cite_start]IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR, [cite: 34]
    [cite_start]IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO, [cite: 34]
    [cite_start]SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO [cite: 34]
  };

  // 1. BASAL TONE & DRIFT (The "Down and Out" Fix)
  [cite_start]// Horizontal: Unopposed LR pulls OUT. [cite: 35]
  [cite_start]const driftX = (1 - h.LR) * -0.4 + (1 - h.MR) * 0.4; [cite: 35]
  
  [cite_start]// Vertical: Unopposed SO pulls DOWN. [cite: 36]
  // Basal tone correction: If CN3 is out, drift is significantly Negative (Down) due to SO tone.
  const driftY = (1 - h.SR) * -0.1 + (1 - h.IR) * 0.1 + (h.SR === 0 && h.IR === 0 ? -0.25 : 0);

  [cite_start]// 2. SMOOTH MECHANICAL BLENDING [cite: 37]
  let allowedYaw = isRight ? 
    (targetYaw < 0 ? targetYaw * h.LR : targetYaw * h.MR) [cite_start]: [cite: 37, 38]
    (targetYaw > 0 ? targetYaw * h.LR : targetYaw * h.MR)[cite_start]; [cite: 38, 39]

  [cite_start]// Nasal factor smoothly scales SO depression vs IR depression [cite: 39]
  [cite_start]const nasalYaw = isRight ? targetYaw : -targetYaw; [cite: 39]
  [cite_start]const nasalFactor = THREE.MathUtils.clamp((nasalYaw + 0.5) / 1.0, 0, 1); [cite: 39]

  [cite_start]// 3. VERTICAL AUTHORITY [cite: 39, 40]
  let allowedPitch;
  [cite_start]if (targetPitch > 0) { [cite: 40]
     [cite_start]allowedPitch = nasalFactor > 0.5 ? targetPitch * h.IO : targetPitch * h.SR; [cite: 41]
  [cite_start]} else { [cite: 41]
     [cite_start]allowedPitch = nasalFactor > 0.5 ? targetPitch * h.SO : targetPitch * h.IR; [cite: 42]
  }

  [cite_start]const finalYaw = allowedYaw + (isRight ? -driftX : driftX); [cite: 42]
  [cite_start]const finalPitch = allowedPitch + driftY; [cite: 43]
  
  const abd = isRight ? [cite_start]-finalYaw : finalYaw; [cite: 43]
  [cite_start]const add = -abd; [cite: 43]

  [cite_start]// 4. ACTS / MUSCLE BAR PERCENTAGES [cite: 44]
  return {
    [cite_start]rotation: { y: finalYaw, x: finalPitch }, [cite: 44]
    acts: {
      [cite_start]LR: (0.2 + Math.max(0, abd) * 1.8) * h.LR, [cite: 44]
      [cite_start]MR: (0.2 + Math.max(0, add) * 1.8) * h.MR, [cite: 44]
      [cite_start]SR: (0.2 + Math.max(0, finalPitch) * 2.2 * (1 - nasalFactor)) * h.SR, [cite: 44]
      [cite_start]IR: (0.2 + Math.max(0, -finalPitch) * 1.8 * (1 - nasalFactor)) * h.IR, [cite: 44]
      [cite_start]IO: (0.2 + Math.max(0, finalPitch) * 2.0 * nasalFactor) * h.IO, [cite: 44]
      [cite_start]SO: (0.2 + Math.max(0, -finalPitch) * 1.8 * nasalFactor + (h.IR === 0 ? 0.3 : 0)) * h.SO [cite: 44, 45]
    }
  };
}

[cite_start]const scene = new THREE.Scene(); [cite: 45]
[cite_start]const camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.1, 100); [cite: 46]
[cite_start]camera.position.z = 6.5; [cite: 46]
[cite_start]const renderer = new THREE.WebGLRenderer({ antialias: true }); [cite: 46]
[cite_start]renderer.setSize(window.innerWidth, window.innerHeight); [cite: 47]
[cite_start]document.getElementById("app").appendChild(renderer.domElement); [cite: 47]
[cite_start]scene.add(new THREE.HemisphereLight(0xffffff, 0, 0.5)); [cite: 47]
[cite_start]const penlight = new THREE.PointLight(0xffffff, 80, 10); [cite: 47]
[cite_start]scene.add(penlight); [cite: 47]

[cite_start]const targetVec = new THREE.Vector3(); [cite: 47]
[cite_start]let model, eyeL, eyeR; [cite: 48]

window.addEventListener("pointermove", (e) => {
  [cite_start]const m = { x: (e.clientX/window.innerWidth)*2-1, y: -(e.clientY/window.innerHeight)*2+1 }; [cite: 48]
  [cite_start]const r = new THREE.Raycaster(); r.setFromCamera(m, camera); [cite: 48]
  [cite_start]r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), -2.5), targetVec); [cite: 48]
  [cite_start]APP_STATE.hasPointer = true; [cite: 48]
});

[cite_start]initUI(); [cite: 49]

new GLTFLoader().load("./head_eyes_v1.glb", (gltf) => {
  [cite_start]model = gltf.scene; model.position.y = -1.6; [cite: 49]
  [cite_start]model.scale.setScalar(1.8 / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y); [cite: 49]
  model.traverse(o => {
    [cite_start]if (o.name === "Eye_L") eyeL = o; if (o.name === "Eye_R") eyeR = o; [cite: 49]
    [cite_start]if (o.name.toLowerCase().includes("cornea")) o.material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0 }); [cite: 49]
  });
  [cite_start]scene.add(model); [cite: 49]
  [cite_start]document.getElementById("loading").style.display = "none"; [cite: 49]
  [cite_start]APP_STATE.ready = true; [cite: 49]
  [cite_start]animate(); [cite: 49]
});

function animate() {
  [cite_start]if (!APP_STATE.ready) return; [cite: 50]
  [cite_start]requestAnimationFrame(animate); [cite: 50]
  [cite_start]if (APP_STATE.hasPointer) penlight.position.set(targetVec.x, targetVec.y, targetVec.z + 0.6); [cite: 50]
  [cite_start]if (model) model.rotation.z = APP_STATE.headTilt; [cite: 50]

  [ {mesh: eyeL, isR: false, s: "left"}, {mesh: eyeR, isR: true, s: "right"} ].forEach(i => {
    [cite_start]if (!i.mesh) return; [cite: 51]
    [cite_start]const eyePos = new THREE.Vector3(); [cite: 51]
    [cite_start]i.mesh.getWorldPosition(eyePos); [cite: 51]
    [cite_start]const yaw = Math.atan2(targetVec.x - eyePos.x, targetVec.z - eyePos.z); [cite: 51]
    [cite_start]const pitch = Math.atan2(targetVec.y - eyePos.y, targetVec.z - eyePos.z); [cite: 51]
    [cite_start]const res = getRecruitment(i.isR, yaw, pitch); [cite: 51]
    [cite_start]i.mesh.rotation.set(-res.rotation.x, res.rotation.y, 0, 'YXZ'); [cite: 51]

    MUSCLES.forEach(m => {
      [cite_start]const cache = uiCache[i.s][m]; [cite: 51]
      [cite_start]const valRaw = res.acts[m]; [cite: 51]
      [cite_start]const valDisplay = Math.min(100, Math.round((valRaw / 0.7) * 100)); [cite: 52]
      [cite_start]cache.bar.style.width = valDisplay + "%"; [cite: 52]
      [cite_start]cache.pct.innerText = valDisplay + "%"; [cite: 52]
      cache.bar.style.background = valRaw < 0.05 ? [cite_start]"#ff4d6d" : (valRaw < 0.25 ? "#ffb703" : "#4cc9f0"); [cite: 52]
    });
  });
  [cite_start]renderer.render(scene, camera); [cite: 53]
}
