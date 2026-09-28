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
