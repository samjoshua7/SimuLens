import { FastifyInstance } from 'fastify';
import { ValidationEngine } from '@simulens/reasoning-engine';
import { PredictionEnvelope, TelemetryStep } from '@simulens/shared';

export async function validationRoutes(fastify: FastifyInstance) {
  // POST /api/validation/evaluate
  fastify.post<{
    Body: {
      prediction: PredictionEnvelope;
      actualTrajectory: TelemetryStep[];
    };
  }>('/evaluate', async (request, reply) => {
    const { prediction, actualTrajectory } = request.body;
    if (!prediction || !actualTrajectory) {
      return reply.badRequest('Missing prediction or actualTrajectory payload');
    }
    const metrics = ValidationEngine.evaluate(prediction, actualTrajectory);
    return metrics;
  });
}
