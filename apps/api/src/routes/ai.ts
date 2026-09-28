import { FastifyInstance } from 'fastify';
import { aiService } from '../services/ai.js';
import { StructuredAIRequest } from '@simulens/shared';

export async function aiRoutes(fastify: FastifyInstance) {
  // POST /api/ai/interpret
  fastify.post('/interpret', async (request, reply) => {
    const req = request.body as StructuredAIRequest;
    if (!req || !req.user_query) {
      return reply.badRequest('user_query is required');
    }
    const interpreted = await aiService.interpretQuery(req);
    return interpreted;
  });
}
