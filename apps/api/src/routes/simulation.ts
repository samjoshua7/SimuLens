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
}
