-- =============================================================================
-- SimuLens — Seed Data (supabase/seed.sql)
-- =============================================================================

INSERT INTO public.simulator_configs (id, domain, version, config_hash, config_json)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'cooling_system',
  '1.0.0',
  'hash_cooling_default_v1',
  '{
    "domain": "cooling_system",
    "version": "1.0.0",
    "dt_seconds": 30,
    "nominal_bounds": {
      "load_pct": [0, 100],
      "fan_pct": [0, 100],
      "coolant_pct": [0, 100],
      "ambient_c": [10, 45],
      "temperature_c": [20, 100],
      "pressure_bar": [1, 10],
      "power_kw": [0, 30],
      "vibration_mm_s": [0, 5]
    }
  }'::jsonb
) ON CONFLICT (config_hash) DO NOTHING;

INSERT INTO ground_truth.physical_parameters (
  config_hash, a1_load_heat, b1_fan_cool, b2_coolant_cool, eta_t_inertia,
  delta_fouling, phi_max, p0_pressure, p1_coolant_press, p2_temp_press,
  w0_idle_power, w1_load_power, w2_fan_cube, w3_coolant_power,
  v0_idle_vib, v1_load_vib, v2_fan_vib, v3_fouling_vib
) VALUES (
  'hash_cooling_default_v1', 0.85, 0.50, 0.70, 0.15,
  0.0005, 0.80, 2.0, 0.04, 0.08,
  1.5, 0.18, 8.0, 0.06,
  0.2, 0.015, 0.010, 1.5
) ON CONFLICT (config_hash) DO NOTHING;
