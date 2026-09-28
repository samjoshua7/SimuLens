import { FastifyInstance } from 'fastify';
import { supabaseService } from '../services/supabase.js';
import { ExperimentRecord } from '@simulens/shared';

export async function experimentRoutes(fastify: FastifyInstance) {
  // GET /api/experiments
  fastify.get('/', async () => {
    const list = await supabaseService.listExperiments();
    return { experiments: list };
  });

  // GET /api/experiments/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const item = await supabaseService.getExperiment(request.params.id);
    if (!item) {
      return reply.notFound(`Experiment ${request.params.id} not found`);
    }
    return item;
  });

  // POST /api/experiments
  fastify.post('/', async (request, reply) => {
    const exp = request.body as ExperimentRecord;
    if (!exp || !exp.name || !exp.initial_state || !exp.predicted_trajectory) {
      return reply.badRequest('Incomplete experiment record');
    }
    const saved = await supabaseService.saveExperiment(exp);
    return saved;
  });
}
