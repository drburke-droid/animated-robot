import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MUSCLES = ["LR", "MR", "SR", "IR", "SO", "IO"];
const APP_STATE = { ready: false, hasPointer: false, zoom: 6.5 };
const uiCache = { left: {}, right: {} };
const gazeDot = document.getElementById('gaze-dot');

const SYSTEM_STATE = {
  nerves: { "R-CN3": 1, "R-CN4": 1, "R-CN6": 1, "L-CN3": 1, "L-CN4": 1, "L-CN6": 1 },
  muscles: { 
    right: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 },
    left: { LR: 1, MR: 1, SR: 1, IR: 1, SO: 1, IO: 1 }
  }
};

// ... (Keep PATHOLOGIES exactly as in your working file) ...
[cite: 4, 19]

function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  const h = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  // Restoring resting alignment [cite: 35, 36]
  const driftX = (1 - h.LR) * -0.4 + (1 - h.MR) * 0.4;
  const driftY = (1 - h.SR) * -0.25 + (1 - h.IR) * 0.25 + (h.SO < 1 ? 0.25 : 0);

  // Horizontal Gating [cite: 37, 38, 39]
  let allowedYaw = isRight ? 
    (targetYaw < 0 ? targetYaw * h.LR : targetYaw * h.MR) : 
    (targetYaw > 0 ? targetYaw * h.LR : targetYaw * h.MR);

  // --- THE FIX: SMOOTH MECHANICAL ADVANTAGE ---
  // Calculate how 'nasal' the eye is currently looking (-1 to 1)
  const currentNasalPos = isRight ? allowedYaw : -allowedYaw; 
  
  // Use a Sigmoid-like blend instead of a linear factor to prevent jumps [cite: 40, 42]
  const blend = 1 / (1 + Math.exp(-currentNasalPos * 5)); 

  // Elevation/Depression authority [cite: 41, 42]
  let mY = targetPitch > 0 ? 
    (targetPitch * THREE.MathUtils.lerp(h.SR, h.IO, blend)) : 
    (targetPitch * THREE.MathUtils.lerp(h.IR, h.SO, blend));

  const fYaw = allowedYaw + (isRight ? -driftX : driftX);
  const fPit = mY + driftY;
  
  const abd = isRight ? -fYaw : fYaw;
  const add = -abd;

  // SO Effort Logic: Significant reduction in temporal gaze [cite: 45, 52]
  const soEffort = Math.max(0, -fPit) * 2.0 * blend; 
  const irEffort = Math.max(0, -fPit) * 2.0 * (1 - blend);

  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, abd) * 1.8) * h.LR,
      MR: (0.2 + Math.max(0, add) * 1.8) * h.MR,
      SR: (0.2 + Math.max(0, fPit) * 2.2 * (1 - blend)) * h.SR,
      IR: (0.2 + irEffort) * h.IR,
      IO: (0.2 + Math.max(0, fPit) * 2.0 * blend) * h.IO,
      SO: (0.2 + soEffort) * h.SO
    }
  };
}

// ... (Remaining animation and loading logic from [cite: 50, 51, 52, 53]) ...
