export const COOLING_SYSTEM_CONSTANTS = {
  DOMAIN: 'cooling_system',
  VERSION: '1.0.0',
  DT_SECONDS: 30,

  // Reference physical parameter constants
  PHYSICS: {
    ambient_mean: 25.0,
    kappa_reversion: 0.05,
    a1_load_heat: 0.85,
    b1_fan_cool: 0.50,
    b2_coolant_cool: 0.70,
    eta_t_inertia: 0.15,
    delta_fouling: 0.0005,
    phi_max: 0.80,
    p0_pressure: 2.0,
    p1_coolant_press: 0.04,
    p2_temp_press: 0.08,
    w0_idle_power: 1.5,
    w1_load_power: 0.18,
    w2_fan_cube: 8.0,
    w3_coolant_power: 0.06,
    v0_idle_vib: 0.2,
    v1_load_vib: 0.015,
    v2_fan_vib: 0.010,
    v3_fouling_vib: 1.5,
  },

  // Exogenous noise standard deviations (R1, R2)
  NOISE_SIGMA: {
    ambient: 0.15,
    temperature: 0.35,
    pressure: 0.05,
    power: 0.10,
    vibration: 0.03,
    fouling: 0.0001,
  },

  // Nominal operating bounds for OOD / Reliability region detection
  NOMINAL_BOUNDS: {
    machine_load: { min: 10, max: 85 },
    fan_speed: { min: 20, max: 90 },
    coolant_flow: { min: 20, max: 90 },
    ambient_temperature: { min: 15, max: 35 },
    temperature_c: { min: 25, max: 85 },
    pressure_bar: { min: 2.0, max: 7.0 },
    power_kw: { min: 2.0, max: 25.0 },
    vibration_mm_s: { min: 0.2, max: 2.5 },
  },

  // Safe physical limits (clipping)
  PHYSICAL_LIMITS: {
    machine_load: { min: 0, max: 100 },
    fan_speed: { min: 0, max: 100 },
    coolant_flow: { min: 0, max: 100 },
    ambient_temperature: { min: -10, max: 60 },
    temperature_c: { min: 10, max: 130 },
    pressure_bar: { min: 0.5, max: 15.0 },
    power_kw: { min: 0.5, max: 50.0 },
    vibration_mm_s: { min: 0.05, max: 15.0 },
  }
};
