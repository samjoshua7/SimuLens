/**
 * Observable system state for industrial machine / cooling system
 */
export interface SystemState {
    temperature_c: number;
    pressure_bar: number;
    power_kw: number;
    vibration_mm_s: number;
    cooling_efficiency: number;
}
/**
 * Controllable actions
 */
export interface ControllableAction {
    machine_load: number;
    fan_speed: number;
    coolant_flow: number;
    cooling_setpoint?: number;
}
/**
 * Environmental / exogenous conditions
 */
export interface EnvironmentCondition {
    ambient_temperature: number;
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
    fouling_phi: number;
    eps_temp: number;
    eps_pressure: number;
    eps_power: number;
    eps_vibration: number;
    eps_ambient: number;
    eps_fouling: number;
}
export interface SimulationStepRecord {
    t: number;
    observed: TelemetryStep;
    ground_truth?: LatentGroundTruth;
}
//# sourceMappingURL=system.d.ts.map