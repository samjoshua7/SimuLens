import { FastifyInstance } from 'fastify';
import { NextStatePredictor, ActionConditionedPredictor } from '@simulens/reasoning-engine';
import { SystemState, ControllableAction, EnvironmentCondition } from '@simulens/shared';

export async function predictionRoutes(fastify: FastifyInstance) {
  // POST /api/prediction/next-state (Ability 1)
  fastify.post<{
    Body: {
      currentState: SystemState;
      action: ControllableAction;
      environment: EnvironmentCondition;
    };
  }>('/next-state', async (request, reply) => {
    const { currentState, action, environment } = request.body;
    if (!currentState || !action || !environment) {
      return reply.badRequest('Missing currentState, action, or environment');
    }
    const prediction = NextStatePredictor.predict({ currentState, action, environment });
    return prediction;
  });

  // POST /api/prediction/action-conditioned (Ability 2)
  fastify.post<{
    Body: {
      currentState: SystemState;
      actions: ControllableAction[];
      environment: EnvironmentCondition;
    };
  }>('/action-conditioned', async (request, reply) => {
    const { currentState, actions, environment } = request.body;
    if (!currentState || !actions || !environment) {
      return reply.badRequest('Missing currentState, actions, or environment');
    }
    const prediction = ActionConditionedPredictor.predict({ currentState, actions, environment });
    return prediction;
  });
}
