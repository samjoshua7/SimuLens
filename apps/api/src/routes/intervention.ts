import { FastifyInstance } from 'fastify';
import { InterventionEngine } from '@simulens/reasoning-engine';
import { SystemState, ControllableAction, EnvironmentCondition, InterventionSpec } from '@simulens/shared';

export async function interventionRoutes(fastify: FastifyInstance) {
  // POST /api/intervention/simulate (Ability 3)
  fastify.post<{
    Body: {
      currentState: SystemState;
      nominalAction: ControllableAction;
      intervention: InterventionSpec;
      environment: EnvironmentCondition;
    };
  }>('/simulate', async (request, reply) => {
    const { currentState, nominalAction, intervention, environment } = request.body;
    if (!currentState || !nominalAction || !intervention || !environment) {
      return reply.badRequest('Missing currentState, nominalAction, intervention, or environment');
    }
    const result = InterventionEngine.simulate({ currentState, nominalAction, intervention, environment });
    return result;
  });
}
