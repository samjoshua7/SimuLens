import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { NextStatePredictor } from '../abilities/next-state.js';
import { ActionConditionedPredictor } from '../abilities/action-conditioned.js';
import { InterventionEngine } from '../abilities/intervention.js';
import { CounterfactualEngine } from '../abilities/counterfactual.js';
import { ValidationEngine } from '../validation.js';

test('Ability 1 - NextStatePredictor returns calibrated envelope and assumptions', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const pred = NextStatePredictor.predict({
    currentState: init.state,
    action: init.action,
    environment: init.environment,
  });

  assert.equal(pred.ability, 'next_state');
  assert.equal(pred.steps.length, 1);
  assert.ok(pred.assumptions.length >= 4);
  const tempEnv = pred.steps[0].variables.temperature_c;
  assert.ok(tempEnv.lo_90 < tempEnv.mean && tempEnv.mean < tempEnv.hi_90);
  assert.ok(tempEnv.aleatoric_std > 0);
});

test('Ability 2 - ActionConditionedPredictor projects over horizon with widening uncertainty', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const actions = Array(5).fill({ machine_load: 60, fan_speed: 45, coolant_flow: 40 });
  const pred = ActionConditionedPredictor.predict({
    currentState: init.state,
    actions,
    environment: init.environment,
  });

  assert.equal(pred.ability, 'action_conditioned');
  assert.equal(pred.steps.length, 5);
  // Uncertainty must compound over time
  const step1Std = pred.steps[0].variables.temperature_c.std;
  const step5Std = pred.steps[4].variables.temperature_c.std;
  assert.ok(step5Std > step1Std, `Horizon step 5 std (${step5Std}) must exceed step 1 std (${step1Std})`);
});

test('Ability 3 - InterventionEngine performs graph surgery and alters trajectory', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const resIntervened = InterventionEngine.simulate({
    currentState: init.state,
    nominalAction: { machine_load: 60, fan_speed: 30, coolant_flow: 30 },
    intervention: {
      target_variable: 'fan_speed',
      forced_value: 90,
      start_step: 0,
      horizon: 6,
    },
    environment: init.environment,
  });

  const resNominal = InterventionEngine.simulate({
    currentState: init.state,
    nominalAction: { machine_load: 60, fan_speed: 30, coolant_flow: 30 },
    intervention: {
      target_variable: 'fan_speed',
      forced_value: 30,
      start_step: 0,
      horizon: 6,
    },
    environment: init.environment,
  });

  assert.equal(resIntervened.prediction.ability, 'intervention');
  assert.equal(resIntervened.graphSurgery.intervenedVariable, 'fan_speed');
  assert.ok(resIntervened.prediction.steps.length === 6);
  // Fan speed forced to 90% cools machine down compared to nominal fan 30%
  assert.ok(
    resIntervened.afterStateExpected.temperature_c < resNominal.afterStateExpected.temperature_c,
    `Intervened temp (${resIntervened.afterStateExpected.temperature_c}) should be lower than nominal temp (${resNominal.afterStateExpected.temperature_c})`
  );
});

test('Ability 4 - Counterfactual consistency: unchanged action reproduces historical episode', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const sim = new CoolingSystemSimulator({ seed: 777, noise_enabled: true });
  const actions = Array(6).fill({ machine_load: 55, fan_speed: 40, coolant_flow: 40 });
  const rollout = sim.rollout(init.state, actions, init.environment);

  // Build recorded steps history
  const recordedSteps = [
    {
      t: 0,
      machine_load: init.action.machine_load,
      fan_speed: init.action.fan_speed,
      coolant_flow: init.action.coolant_flow,
      ambient_temperature: init.environment.ambient_temperature,
      ...init.state,
    },
    ...rollout.map((r: any) => ({
      t: r.t,
      machine_load: r.observed.action.machine_load,
      fan_speed: r.observed.action.fan_speed,
      coolant_flow: r.observed.action.coolant_flow,
      ambient_temperature: r.observed.environment.ambient_temperature,
      ...r.observed.state,
    })),
  ];

  // Counterfactual with UNCHANGED action should reproduce the recorded trajectory exactly!
  const cfResult = CounterfactualEngine.evaluate({
    change_step: 2,
    changed_variable: 'fan_speed',
    new_value: 40, // exactly the same as recorded
    recorded_steps: recordedSteps,
  });

  for (let i = 0; i < recordedSteps.length; i++) {
    const act = cfResult.actualTrajectory[i].state.temperature_c;
    const cf = cfResult.counterfactualTrajectory[i].state.temperature_c;
    assert.ok(Math.abs(act - cf) <= 0.15, `Step ${i}: actual (${act}) != counterfactual (${cf})`);
  }
});

test('ValidationEngine - Evaluates error metrics and coverage against actual outcomes', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const actions = Array(5).fill({ machine_load: 50, fan_speed: 40, coolant_flow: 40 });
  const pred = ActionConditionedPredictor.predict({
    currentState: init.state,
    actions,
    environment: init.environment,
  });

  const sim = new CoolingSystemSimulator({ seed: 42, noise_enabled: true });
  const actualRecords = sim.rollout(init.state, actions, init.environment);
  const actualTelemetry = actualRecords.map((r: any) => r.observed);

  const val = ValidationEngine.evaluate(pred, actualTelemetry);
  assert.ok(typeof val.mae.temperature_c === 'number');
  assert.ok(typeof val.rmse.temperature_c === 'number');
  assert.ok(val.picp_90.temperature_c >= 0 && val.picp_90.temperature_c <= 1);
  assert.equal(val.comparisons.length, 5 * 5); // 5 steps * 5 variables
});
