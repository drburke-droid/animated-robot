// --- UPDATED CORE CLINICAL LOGIC ---
function getRecruitment(isRight, targetYaw, targetPitch) {
  const side = isRight ? 'right' : 'left';
  const prefix = isRight ? 'R-' : 'L-';
  
  // Health multipliers for each nerve/muscle unit
  const h = {
    LR: SYSTEM_STATE.nerves[prefix+'CN6'] * SYSTEM_STATE.muscles[side].LR,
    MR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].MR,
    SR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].SR,
    IR: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IR,
    IO: SYSTEM_STATE.nerves[prefix+'CN3'] * SYSTEM_STATE.muscles[side].IO,
    SO: SYSTEM_STATE.nerves[prefix+'CN4'] * SYSTEM_STATE.muscles[side].SO
  };

  // 1. BASAL TONE & DRIFT (The "Down and Out" Fix)
  // Horizontal: Unopposed LR pulls OUT[cite: 4, 35].
  // Vertical: Unopposed SO pulls DOWN[cite: 4, 36, 45].
  const driftX = (1 - h.LR) * -0.4 + (1 - h.MR) * 0.4;
  
  // Adjusted driftY: If CN3 is out, drift is significantly Negative (Down) due to SO tone[cite: 36, 45].
  const driftY = (1 - h.SR) * -0.1 + (1 - h.IR) * 0.1 + (h.SR === 0 && h.IR === 0 ? -0.25 : 0);

  // 2. SMOOTH MECHANICAL BLENDING
  let allowedYaw = isRight ? 
    (targetYaw < 0 ? targetYaw * h.LR : targetYaw * h.MR) : 
    (targetYaw > 0 ? targetYaw * h.LR : targetYaw * h.MR);

  const currentNasalPos = isRight ? allowedYaw : -allowedYaw; 
  const blend = 1 / (1 + Math.exp(-currentNasalPos * 5)); 

  // 3. VERTICAL AUTHORITY
  let mY = targetPitch > 0 ? 
    (targetPitch * THREE.MathUtils.lerp(h.SR, h.IO, blend)) : 
    (targetPitch * THREE.MathUtils.lerp(h.IR, h.SO, blend));

  const fYaw = allowedYaw + (isRight ? -driftX : driftX);
  const fPit = mY + driftY;
  
  const abd = isRight ? -fYaw : fYaw;
  const add = -abd;

  // 4. ACTS / MUSCLE BAR PERCENTAGES
  // In CN III palsy, SO acts as a secondary abductor and primary depressor[cite: 4, 45].
  return {
    rotation: { y: fYaw, x: fPit },
    acts: {
      LR: (0.2 + Math.max(0, abd) * 1.8) * h.LR,
      MR: (0.2 + Math.max(0, add) * 1.8) * h.MR,
      SR: (0.2 + Math.max(0, fPit) * 2.2 * (1 - blend)) * h.SR,
      IR: (0.2 + Math.max(0, -fPit) * 2.0 * (1 - blend)) * h.IR,
      IO: (0.2 + Math.max(0, fPit) * 2.0 * blend) * h.IO,
      SO: (0.2 + Math.max(0, -fPit) * 2.0 * blend + (h.IR === 0 ? 0.3 : 0)) * h.SO
    }
  };
}
