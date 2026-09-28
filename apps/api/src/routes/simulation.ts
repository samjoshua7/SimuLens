import { FastifyInstance } from 'fastify';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { SystemState, ControllableAction, EnvironmentCondition } from '@simulens/shared';

export async function simulationRoutes(fastify: FastifyInstance) {
  // GET /api/simulation/initial
  fastify.get('/initial', async () => {
    return CoolingSystemSimulator.getInitialState();
  });

  // POST /api/simulation/step
  fastify.post<{
    Body: {
      currentState: SystemState;
      action: ControllableAction;
      environment: EnvironmentCondition;
      seed?: number;
      noise_enabled?: boolean;
    };
  }>('/step', async (request, reply) => {
    const { currentState, action, environment, seed, noise_enabled } = request.body;
    if (!currentState || !action || !environment) {
      return reply.badRequest('Missing currentState, action, or environment');
    }
    const sim = new CoolingSystemSimulator({ seed: seed ?? 42, noise_enabled: noise_enabled ?? true });
    const record = sim.step(currentState, action, environment, 0);
    // Return observed step (ground truth stripped for client)
    return {
      t: record.t,
      observed: record.observed,
    };
  });

  // POST /api/simulation/run (multi-step rollout)
  fastify.post<{
    Body: {
      initialState: SystemState;
      actions: ControllableAction[];
      environment: EnvironmentCondition;
      seed?: number;
      noise_enabled?: boolean;
    };
  }>('/run', async (request, reply) => {
    const { initialState, actions, environment, seed, noise_enabled } = request.body;
    if (!initialState || !actions || !environment) {
      return reply.badRequest('Missing initialState, actions, or environment');
    }
    const sim = new CoolingSystemSimulator({ seed: seed ?? 42, noise_enabled: noise_enabled ?? true });
    const trajectory = sim.rollout(initialState, actions, environment);
    return {
      trajectory: trajectory.map((r: any) => r.observed),
    };
  });

  // POST /api/simulation/step-batch (batch stepping for multiple machines in one round-trip)
  fastify.post<{
    Body: {
      machines: Array<{
        id: string;
        currentState: SystemState;
        action: ControllableAction;
        environment?: EnvironmentCondition;
        seed?: number;
        noise_enabled?: boolean;
      }>;
      defaultEnvironment?: EnvironmentCondition;
    };
  }>('/step-batch', async (request, reply) => {
    const { machines, defaultEnvironment } = request.body;
    if (!Array.isArray(machines)) {
      return reply.badRequest('Missing or invalid machines array');
    }

    const fallbackEnv: EnvironmentCondition = defaultEnvironment || {
      ambient_temperature: 25,
    };

    const results = machines.map((item) => {
      const env = item.environment || fallbackEnv;
      const sim = new CoolingSystemSimulator({
        seed: item.seed ?? (Math.floor(Math.random() * 100000)),
        noise_enabled: item.noise_enabled ?? true,
      });
      const record = sim.step(item.currentState, item.action, env, 0);
      return {
        id: item.id,
        t: record.t,
        observed: record.observed,
      };
    });

    return { results };
  });
}
