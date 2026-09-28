import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  CounterfactualSpec,
  PredictionEnvelope,
  COOLING_SYSTEM_CONSTANTS
} from '@simulens/shared';
import { OperatingRegionEvaluator } from '@simulens/world-model';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { UncertaintyEngine } from '../uncertainty.js';

export interface CounterfactualResult {
  actualTrajectory: Array<{
    t: number;
    action: ControllableAction;
    state: SystemState;
    environment: EnvironmentCondition;
  }>;
  counterfactualTrajectory: Array<{
    t: number;
    action: ControllableAction;
    state: SystemState;
    environment: EnvironmentCondition;
  }>;
  predictionEnvelope: PredictionEnvelope;
  abductedResiduals: Array<{
    t: number;
    eps_temp: number;
    eps_pressure: number;
    eps_power: number;
    eps_vibration: number;
  }>;
  divergenceSummary: {
    temperatureDiff: number;
    powerDiff: number;
    pressureDiff: number;
    coolingEfficiencyDiff: number;
  };
}

export class CounterfactualEngine {
  /**
   * Ability 4: Counterfactual reasoning on recorded episodes via Abduction -> Action -> Replay
   */
  static evaluate(spec: CounterfactualSpec): CounterfactualResult {
    const steps = spec.recorded_steps;
    if (steps.length < 2) {
      throw new Error('Counterfactual requires at least 2 recorded steps in the episode.');
    }

    const sim = new CoolingSystemSimulator({ noise_enabled: false });
    const P = COOLING_SYSTEM_CONSTANTS.PHYSICS;
    const L = COOLING_SYSTEM_CONSTANTS.PHYSICAL_LIMITS;

    // 1. Abduction: Compute residual exogenous shocks eps_t = S_{t+1} - f(S_t, A_t, E_t)
    const abductedResiduals: CounterfactualResult['abductedResiduals'] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const cur = steps[i];
      const next = steps[i + 1];

      const curState: SystemState = {
        temperature_c: cur.temperature_c,
        pressure_bar: cur.pressure_bar,
        power_kw: cur.power_kw,
        vibration_mm_s: cur.vibration_mm_s,
        cooling_efficiency: cur.cooling_efficiency,
      };
      const curAction: ControllableAction = {
        machine_load: cur.machine_load,
        fan_speed: cur.fan_speed,
        coolant_flow: cur.coolant_flow,
      };
      const curEnv: EnvironmentCondition = {
        ambient_temperature: cur.ambient_temperature,
      };

      const nominalNext = sim.step(curState, curAction, curEnv, cur.t);

      abductedResiduals.push({
        t: cur.t,
        eps_temp: next.temperature_c - nominalNext.observed.state.temperature_c,
        eps_pressure: next.pressure_bar - nominalNext.observed.state.pressure_bar,
        eps_power: next.power_kw - nominalNext.observed.state.power_kw,
        eps_vibration: next.vibration_mm_s - nominalNext.observed.state.vibration_mm_s,
      });
    }

    // 2. Action Surgery & Replay under abducted residuals
    const counterfactualTrajectory: CounterfactualResult['counterfactualTrajectory'] = [];
    const actualTrajectory: CounterfactualResult['actualTrajectory'] = [];

    // Step 0 is identical historical starting state
    const initRecorded = steps[0];
    const initAction: ControllableAction = {
      machine_load: initRecorded.machine_load,
      fan_speed: initRecorded.fan_speed,
      coolant_flow: initRecorded.coolant_flow,
    };
    const initState: SystemState = {
      temperature_c: initRecorded.temperature_c,
      pressure_bar: initRecorded.pressure_bar,
      power_kw: initRecorded.power_kw,
      vibration_mm_s: initRecorded.vibration_mm_s,
      cooling_efficiency: initRecorded.cooling_efficiency,
    };
    const initEnv: EnvironmentCondition = {
      ambient_temperature: initRecorded.ambient_temperature,
    };

    actualTrajectory.push({
      t: initRecorded.t,
      action: initAction,
      state: initState,
      environment: initEnv,
    });
    counterfactualTrajectory.push({
      t: initRecorded.t,
      action: { ...initAction },
      state: { ...initState },
      environment: { ...initEnv },
    });

    let cfState = { ...initState };
    let cfEnv = { ...initEnv };

    for (let i = 0; i < steps.length - 1; i++) {
      const rec = steps[i];
      const nextRec = steps[i + 1];

      // Actual recorded trajectory point
      actualTrajectory.push({
        t: nextRec.t,
        action: {
          machine_load: nextRec.machine_load,
          fan_speed: nextRec.fan_speed,
          coolant_flow: nextRec.coolant_flow,
        },
        state: {
          temperature_c: nextRec.temperature_c,
          pressure_bar: nextRec.pressure_bar,
          power_kw: nextRec.power_kw,
          vibration_mm_s: nextRec.vibration_mm_s,
          cooling_efficiency: nextRec.cooling_efficiency,
        },
        environment: {
          ambient_temperature: nextRec.ambient_temperature,
        },
      });

      // Counterfactual action selection: if t >= change_step, apply changed variable
      const isPostIntervention = rec.t >= spec.change_step;
      const cfAction: ControllableAction = {
        machine_load: isPostIntervention && spec.changed_variable === 'machine_load' ? spec.new_value : rec.machine_load,
        fan_speed: isPostIntervention && spec.changed_variable === 'fan_speed' ? spec.new_value : rec.fan_speed,
        coolant_flow: isPostIntervention && spec.changed_variable === 'coolant_flow' ? spec.new_value : rec.coolant_flow,
      };

      // Transition with abducted noise
      const res = abductedResiduals[i];
      const nominalStep = sim.step(cfState, cfAction, cfEnv, rec.t);
      const nextObs = nominalStep.observed.state;

      const nextCfState: SystemState = {
        temperature_c: Number(Math.min(L.temperature_c.max, Math.max(L.temperature_c.min, nextObs.temperature_c + res.eps_temp)).toFixed(2)),
        pressure_bar: Number(Math.min(L.pressure_bar.max, Math.max(L.pressure_bar.min, nextObs.pressure_bar + res.eps_pressure)).toFixed(2)),
        power_kw: Number(Math.min(L.power_kw.max, Math.max(L.power_kw.min, nextObs.power_kw + res.eps_power)).toFixed(2)),
        vibration_mm_s: Number(Math.min(L.vibration_mm_s.max, Math.max(L.vibration_mm_s.min, nextObs.vibration_mm_s + res.eps_vibration)).toFixed(3)),
        cooling_efficiency: nextObs.cooling_efficiency,
      };

      cfState = nextCfState;
      cfEnv = nominalStep.observed.environment;

      counterfactualTrajectory.push({
        t: nextRec.t,
        action: cfAction,
        state: cfState,
        environment: cfEnv,
      });
    }

    const lastActual = actualTrajectory[actualTrajectory.length - 1].state;
    const lastCf = counterfactualTrajectory[counterfactualTrajectory.length - 1].state;

    // Build prediction envelope for the counterfactual replay
    const assessment = OperatingRegionEvaluator.assess(
      cfState,
      counterfactualTrajectory[counterfactualTrajectory.length - 1].action,
      cfEnv
    );
    const stepEnvelopes = counterfactualTrajectory.slice(1).map((pt, idx) =>
      UncertaintyEngine.buildStepEnvelope(pt.state, assessment, idx + 1)
    );

    return {
      actualTrajectory,
      counterfactualTrajectory,
      predictionEnvelope: {
        ability: 'counterfactual',
        horizon: steps.length - 1,
        steps: stepEnvelopes,
        assumptions: ['C1', 'C2', 'C3', 'O1', 'O3', 'R1', 'R2'],
        timestamp: new Date().toISOString(),
      },
      abductedResiduals,
      divergenceSummary: {
        temperatureDiff: Number((lastCf.temperature_c - lastActual.temperature_c).toFixed(2)),
        powerDiff: Number((lastCf.power_kw - lastActual.power_kw).toFixed(2)),
        pressureDiff: Number((lastCf.pressure_bar - lastActual.pressure_bar).toFixed(2)),
        coolingEfficiencyDiff: Number((lastCf.cooling_efficiency - lastActual.cooling_efficiency).toFixed(1)),
      },
    };
  }
}
