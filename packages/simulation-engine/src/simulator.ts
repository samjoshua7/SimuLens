import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  TelemetryStep,
  LatentGroundTruth,
  SimulationStepRecord,
  COOLING_SYSTEM_CONSTANTS
} from '@simulens/shared';
import { SeededRNG } from './rng.js';

export interface SimulatorConfig {
  seed?: number;
  initial_fouling?: number;
  noise_enabled?: boolean;
}

export class CoolingSystemSimulator {
  private rng: SeededRNG;
  private currentFouling: number;
  private noiseEnabled: boolean;

  constructor(config: SimulatorConfig = {}) {
    this.rng = new SeededRNG(config.seed ?? 42);
    this.currentFouling = config.initial_fouling ?? 0.05;
    this.noiseEnabled = config.noise_enabled ?? true;
  }

  /**
   * Reset simulator state and seed
   */
  reset(seed: number = 42, initial_fouling: number = 0.05): void {
    this.rng = new SeededRNG(seed);
    this.currentFouling = initial_fouling;
  }

  /**
   * Generate initial default steady-state
   */
  static getInitialState(): { state: SystemState; action: ControllableAction; environment: EnvironmentCondition } {
    return {
      state: {
        temperature_c: 65.0,
        pressure_bar: 3.5,
        power_kw: 11.2,
        vibration_mm_s: 0.85,
        cooling_efficiency: 95.0,
      },
      action: {
        machine_load: 50.0,
        fan_speed: 40.0,
        coolant_flow: 40.0,
        cooling_setpoint: 65.0,
      },
      environment: {
        ambient_temperature: 25.0,
      },
    };
  }

  /**
   * Execute single deterministic step transition
   * S(t+1) = f(S(t), A(t), E(t), noise)
   */
  step(
    currentState: SystemState,
    action: ControllableAction,
    env: EnvironmentCondition,
    t: number = 0
  ): SimulationStepRecord {
    const P = COOLING_SYSTEM_CONSTANTS.PHYSICS;
    const S = COOLING_SYSTEM_CONSTANTS.NOISE_SIGMA;
    const L = COOLING_SYSTEM_CONSTANTS.PHYSICAL_LIMITS;

    // 1. Exogenous noise draws (Seeded PRNG)
    const eps_ambient = this.noiseEnabled ? this.rng.nextGaussian(0, S.ambient) : 0;
    const eps_temp = this.noiseEnabled ? this.rng.nextGaussian(0, S.temperature) : 0;
    const eps_pressure = this.noiseEnabled ? this.rng.nextGaussian(0, S.pressure) : 0;
    const eps_power = this.noiseEnabled ? this.rng.nextGaussian(0, S.power) : 0;
    const eps_vibration = this.noiseEnabled ? this.rng.nextGaussian(0, S.vibration) : 0;
    const eps_fouling = this.noiseEnabled ? this.rng.nextGaussian(0, S.fouling) : 0;

    // 2. Latent fouling state update (phi)
    const nextFouling = Math.min(
      P.phi_max,
      Math.max(0, this.currentFouling + P.delta_fouling + eps_fouling)
    );
    this.currentFouling = nextFouling;

    // 3. Environmental update (ambient temperature diurnal drift)
    const nextAmbient = Math.min(
      L.ambient_temperature.max,
      Math.max(
        L.ambient_temperature.min,
        env.ambient_temperature + P.kappa_reversion * (P.ambient_mean - env.ambient_temperature) + eps_ambient
      )
    );

    // 4. Physical state transitions
    const load = Math.min(100, Math.max(0, action.machine_load));
    const fan = Math.min(100, Math.max(0, action.fan_speed));
    const coolant = Math.min(100, Math.max(0, action.coolant_flow));

    // Heat removal: cool_t = (b1*F + b2*C) * (1 - phi) * (T - Ta) / 50
    const deltaT = Math.max(0.5, currentState.temperature_c - env.ambient_temperature);
    const heatRemoval = ((P.b1_fan_cool * fan + P.b2_coolant_cool * coolant) * (1.0 - nextFouling) * deltaT) / 50.0;
    const heatGen = P.a1_load_heat * load;

    // Next Temperature
    const nextTemp = Math.min(
      L.temperature_c.max,
      Math.max(
        L.temperature_c.min,
        currentState.temperature_c + P.eta_t_inertia * (heatGen - heatRemoval) + eps_temp
      )
    );

    // Next Pressure: p0 + p1*C + p2*(T_{t+1} - Ta) + eps_p
    const nextPressure = Math.min(
      L.pressure_bar.max,
      Math.max(
        L.pressure_bar.min,
        P.p0_pressure + P.p1_coolant_press * coolant + P.p2_temp_press * (nextTemp - nextAmbient) + eps_pressure
      )
    );

    // Next Power: w0 + w1*L + w2*(F/100)^3 + w3*C + eps_w
    const fanRatio = fan / 100.0;
    const nextPower = Math.min(
      L.power_kw.max,
      Math.max(
        L.power_kw.min,
        P.w0_idle_power + P.w1_load_power * load + P.w2_fan_cube * Math.pow(fanRatio, 3) + P.w3_coolant_power * coolant + eps_power
      )
    );

    // Next Vibration: v0 + v1*L + v2*F + v3*phi + eps_v (Note: V is an effect, never causes T!)
    const nextVibration = Math.min(
      L.vibration_mm_s.max,
      Math.max(
        L.vibration_mm_s.min,
        P.v0_idle_vib + P.v1_load_vib * load + P.v2_fan_vib * fan + P.v3_fouling_vib * nextFouling + eps_vibration
      )
    );

    // Derived Cooling Efficiency
    const nextEfficiency = Math.min(
      100,
      Math.max(0, (1.0 - nextFouling) * 100.0 * (1.0 - 0.05 * Math.max(0, nextTemp - 75.0) / 10.0))
    );

    const nextState: SystemState = {
      temperature_c: Number(nextTemp.toFixed(2)),
      pressure_bar: Number(nextPressure.toFixed(2)),
      power_kw: Number(nextPower.toFixed(2)),
      vibration_mm_s: Number(nextVibration.toFixed(3)),
      cooling_efficiency: Number(nextEfficiency.toFixed(1)),
    };

    const nextEnv: EnvironmentCondition = {
      ambient_temperature: Number(nextAmbient.toFixed(2)),
    };

    const groundTruth: LatentGroundTruth = {
      fouling_phi: Number(nextFouling.toFixed(4)),
      eps_temp,
      eps_pressure,
      eps_power,
      eps_vibration,
      eps_ambient,
      eps_fouling,
    };

    const observed: TelemetryStep = {
      t: t + 1,
      state: nextState,
      action: { machine_load: load, fan_speed: fan, coolant_flow: coolant },
      environment: nextEnv,
    };

    return {
      t: t + 1,
      observed,
      ground_truth: groundTruth,
    };
  }

  /**
   * Run multi-step rollout given initial state and either static action or action array
   */
  rollout(
    initialState: SystemState,
    actions: ControllableAction[],
    initialEnv: EnvironmentCondition,
    startT: number = 0
  ): SimulationStepRecord[] {
    const trajectory: SimulationStepRecord[] = [];
    let curState = { ...initialState };
    let curEnv = { ...initialEnv };

    for (let i = 0; i < actions.length; i++) {
      const stepRecord = this.step(curState, actions[i], curEnv, startT + i);
      trajectory.push(stepRecord);
      curState = stepRecord.observed.state;
      curEnv = stepRecord.observed.environment;
    }

    return trajectory;
  }
}
