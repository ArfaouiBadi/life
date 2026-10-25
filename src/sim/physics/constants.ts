export const PHYS = {
  CD: 0.61, // orifice discharge coefficient
  GAMMA: 1.4, // heat-capacity ratio of air
  R_AIR: 287.05, // J/(kg·K)
  T_CABIN: 293.15, // K
  // Choked-flow factor Γ = (2/(γ+1))^((γ+1)/(2(γ−1))) ≈ 0.5787
  // Effective leak speed CD·Γ·√(γ·R·T) ≈ 0.61 × 0.5787 × 343.2 ≈ 121.2 m/s
  LEAK_SPEED: 121.2,
  PN2_NOMINAL: 80.1,
  PPO2_NOMINAL: 21.2, // kPa, total 101.3
  PPO2_UNSAFE: 16.0, // kPa, the "unsafe air" threshold used for time-to-danger
  O2_USE: 7.41e-4, // kPa·m³/s per person (0.84 kg O₂ per day)
  CO2_GEN: 6.55, // ppm·m³/s per person (1.04 kg CO₂ per day)
  SCRUBBER_RATE: 3e-4, // 1/s at 100% health
  CO2_BASELINE: 400, // ppm
  O2_BLEED_KPA_S: 0.004, // emergency oxygen flow into one zone
  O2_RESERVE_FULL_S: 1200, // reserve lasts 20 sim-minutes at full flow
  REPRESS_KPA_S: 0.05, // repressurization rate after a patch
  CEILING_M: 2.6,
  TEMP_SET_C: 21,
  TEMP_TAU_S: 1800,
  BASE_DOSE_USVH: 8,
  SHELTER_FACTOR: 0.15,
  WATER_USE_L_SOL: 100,
} as const;

export const NOMINAL_PRESSURE = PHYS.PN2_NOMINAL + PHYS.PPO2_NOMINAL;

/** Gaussian noise σ on published readings. */
export const NOISE = { pressure: 0.02, ppO2: 0.01, co2: 15, temp: 0.1 } as const;
