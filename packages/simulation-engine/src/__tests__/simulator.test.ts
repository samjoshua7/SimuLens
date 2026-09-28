import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingSystemSimulator } from '../simulator.js';

test('CoolingSystemSimulator - Deterministic replay with identical seed', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const sim1 = new CoolingSystemSimulator({ seed: 12345, noise_enabled: true });
  const sim2 = new CoolingSystemSimulator({ seed: 12345, noise_enabled: true });

  const actions = Array(5).fill({ machine_load: 60, fan_speed: 50, coolant_flow: 50 });
  const traj1 = sim1.rollout(init.state, actions, init.environment);
  const traj2 = sim2.rollout(init.state, actions, init.environment);

  assert.equal(traj1.length, 5);
  assert.equal(traj2.length, 5);

  for (let i = 0; i < 5; i++) {
    assert.deepEqual(traj1[i].observed.state, traj2[i].observed.state);
    assert.deepEqual(traj1[i].ground_truth, traj2[i].ground_truth);
  }
});

test('CoolingSystemSimulator - Increasing load increases machine temperature', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const simLow = new CoolingSystemSimulator({ seed: 42, noise_enabled: false });
  const simHigh = new CoolingSystemSimulator({ seed: 42, noise_enabled: false });

  const lowActions = Array(10).fill({ machine_load: 30, fan_speed: 40, coolant_flow: 40 });
  const highActions = Array(10).fill({ machine_load: 90, fan_speed: 40, coolant_flow: 40 });

  const lowTraj = simLow.rollout(init.state, lowActions, init.environment);
  const highTraj = simHigh.rollout(init.state, highActions, init.environment);

  const lowFinalTemp = lowTraj[lowTraj.length - 1].observed.state.temperature_c;
  const highFinalTemp = highTraj[highTraj.length - 1].observed.state.temperature_c;

  assert.ok(highFinalTemp > lowFinalTemp, `High load temp (${highFinalTemp}) should exceed low load temp (${lowFinalTemp})`);
});

test('CoolingSystemSimulator - Increasing fan speed decreases machine temperature', () => {
  const init = CoolingSystemSimulator.getInitialState();
  const simLowFan = new CoolingSystemSimulator({ seed: 42, noise_enabled: false });
  const simHighFan = new CoolingSystemSimulator({ seed: 42, noise_enabled: false });

  const lowFanActions = Array(10).fill({ machine_load: 70, fan_speed: 20, coolant_flow: 30 });
  const highFanActions = Array(10).fill({ machine_load: 70, fan_speed: 90, coolant_flow: 30 });

  const lowTraj = simLowFan.rollout(init.state, lowFanActions, init.environment);
  const highTraj = simHighFan.rollout(init.state, highFanActions, init.environment);

  const lowFanFinalTemp = lowTraj[lowTraj.length - 1].observed.state.temperature_c;
  const highFanFinalTemp = highTraj[highTraj.length - 1].observed.state.temperature_c;

  assert.ok(highFanFinalTemp < lowFanFinalTemp, `High fan temp (${highFanFinalTemp}) should be lower than low fan temp (${lowFanFinalTemp})`);
});
