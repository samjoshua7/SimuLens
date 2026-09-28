/**
 * Observable system state for industrial machine / cooling system
 */
export interface SystemState {
  temperature_c: number;     // Machine temperature in degrees Celsius
  pressure_bar: number;      // System pressure in bar
  power_kw: number;          // Power consumption in kilowatts
  vibration_mm_s: number;    // Vibration velocity in mm/s
  cooling_efficiency: number;// Derived efficiency percentage [0-100]
}

/**
 * Controllable actions
 */
export interface ControllableAction {
  machine_load: number;      // Machine load percentage [0-100]
  fan_speed: number;         // Fan speed percentage [0-100]
  coolant_flow: number;      // Coolant pump flow percentage [0-100]
  cooling_setpoint?: number; // Target temperature setpoint [°C]
}

/**
 * Environmental / exogenous conditions
 */
export interface EnvironmentCondition {
  ambient_temperature: number; // Ambient temperature in degrees Celsius
}

/**
 * Combined telemetry point at step t
 */
export interface TelemetryStep {
  t: number;
  state: SystemState;
  action: ControllableAction;
  environment: EnvironmentCondition;
}

/**
 * Restricted ground truth variables (Latent states & exogenous noise)
 * FORBIDDEN to models, prediction path, and gateway inference.
 * Accessible ONLY to simulator generator and validation engine.
 */
export interface LatentGroundTruth {
  fouling_phi: number;       // Heat exchanger fouling factor [0.0 - 0.8]
  eps_temp: number;          // Machine temperature noise draw
  eps_pressure: number;      // Pressure noise draw
  eps_power: number;         // Power consumption noise draw
  eps_vibration: number;     // Vibration noise draw
  eps_ambient: number;       // Ambient temperature drift noise draw
  eps_fouling: number;       // Latent fouling noise draw
}

export interface SimulationStepRecord {
  t: number;
  observed: TelemetryStep;
  ground_truth?: LatentGroundTruth; // Stripped before exposing to clients/models
}
