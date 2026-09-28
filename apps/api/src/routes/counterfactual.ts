import { FastifyInstance } from 'fastify';
import { CounterfactualEngine } from '@simulens/reasoning-engine';
import { CounterfactualSpec } from '@simulens/shared';

export async function counterfactualRoutes(fastify: FastifyInstance) {
  // POST /api/counterfactual/run (Ability 4)
  fastify.post('/run', async (request, reply) => {
    const spec = request.body as CounterfactualSpec;
    if (!spec || !spec.recorded_steps || spec.recorded_steps.length < 2) {
      return reply.badRequest('Invalid counterfactual spec: requires at least 2 recorded steps');
    }
    const result = CounterfactualEngine.evaluate(spec);
    return result;
  });
}
