import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../index.js';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';

test('API - GET /health', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.equal(json.status, 'ok');
  assert.equal(json.service, 'simulens-api');
});

test('API - GET /api/causal/graph returns DAG', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/causal/graph',
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.ok(json.nodes.length >= 8);
  assert.ok(json.edges.length >= 10);
});

test('API - POST /api/prediction/next-state', async () => {
  const app = await buildApp();
  const init = CoolingSystemSimulator.getInitialState();
  const response = await app.inject({
    method: 'POST',
    url: '/api/prediction/next-state',
    payload: {
      currentState: init.state,
      action: init.action,
      environment: init.environment,
    },
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.equal(json.ability, 'next_state');
  assert.ok(json.steps[0].variables.temperature_c.mean > 0);
  assert.ok(json.steps[0].variables.temperature_c.std > 0);
});

test('API - POST /api/intervention/simulate', async () => {
  const app = await buildApp();
  const init = CoolingSystemSimulator.getInitialState();
  const response = await app.inject({
    method: 'POST',
    url: '/api/intervention/simulate',
    payload: {
      currentState: init.state,
      nominalAction: init.action,
      intervention: {
        target_variable: 'fan_speed',
        forced_value: 80,
        start_step: 0,
        horizon: 4,
      },
      environment: init.environment,
    },
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.equal(json.prediction.ability, 'intervention');
  assert.equal(json.graphSurgery.intervenedVariable, 'fan_speed');
});

test('API - POST /api/ai/interpret converts query to structured action', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/interpret',
    payload: {
      intent: 'intervention',
      user_query: 'Increase the fan to 75% and tell me what happens',
    },
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.equal(json.intent, 'intervention');
  assert.equal(json.recognized_action.variable, 'fan_speed');
  assert.equal(json.recognized_action.value, 75);
});

test('API - POST /api/simulation/step-batch returns stepped state for multiple machines', async () => {
  const app = await buildApp();
  const init = CoolingSystemSimulator.getInitialState();
  const response = await app.inject({
    method: 'POST',
    url: '/api/simulation/step-batch',
    payload: {
      machines: [
        {
          id: 'test-m1',
          currentState: init.state,
          action: init.action,
        },
        {
          id: 'test-m2',
          currentState: { ...init.state, temperature_c: 55 },
          action: { ...init.action, machine_load: 50 },
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['x-ratelimit-limit']);
  const json = JSON.parse(response.body);
  assert.equal(json.results.length, 2);
  assert.equal(json.results[0].id, 'test-m1');
  assert.equal(json.results[1].id, 'test-m2');
  assert.ok(json.results[0].observed.state.temperature_c > 0);
});

test('API - POST /api/ai/chat returns copilot response with causal simulation payload', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/chat',
    payload: {
      message: 'What happens if we set fan_speed to 85% on chiller-1?',
      target_machine_id: 'm-chiller-1',
      machines: [
        {
          id: 'm-chiller-1',
          label: 'Primary Chiller Unit',
          machine_type: 'chiller',
          status: 'running',
          telemetry: { temperature_c: 58.2, load_pct: 75, power_kw: 18.4 },
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.ok(json.message);
  assert.equal(json.intent, 'intervention');
  assert.equal(json.recognized_action.variable, 'fan_speed');
  assert.equal(json.recognized_action.value, 85);
  assert.equal(json.simulation_payload.ability, 'intervention');
  assert.ok(json.plant_summary);
  assert.ok(json.suggested_prompts.length > 0);
});

