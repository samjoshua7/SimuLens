import { FastifyInstance } from 'fastify';
import { aiService } from '../services/ai.js';
import { StructuredAIRequest, CopilotChatRequest } from '@simulens/shared';

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

  // POST /api/ai/chat
  fastify.post('/chat', async (request, reply) => {
    const req = request.body as CopilotChatRequest;
    if (!req || !req.message) {
      return reply.badRequest('message is required');
    }
    const response = await aiService.chatWithCopilot(req);
    return response;
  });
}

