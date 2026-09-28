import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const GENERAL_WINDOW_MS = 60 * 1000; // 1 minute
const GENERAL_MAX_REQUESTS = 120;

const AI_WINDOW_MS = 60 * 1000; // 1 minute
const AI_MAX_REQUESTS = 15;

const generalStore = new Map<string, RateLimitBucket>();
const aiStore = new Map<string, RateLimitBucket>();

// Periodic cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of generalStore.entries()) {
    if (now > bucket.resetAt) generalStore.delete(key);
  }
  for (const [key, bucket] of aiStore.entries()) {
    if (now > bucket.resetAt) aiStore.delete(key);
  }
}, 5 * 60 * 1000).unref();

export const rateLimitPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip CORS preflights and health checks
    if (request.method === 'OPTIONS' || request.url === '/health') {
      return;
    }

    const now = Date.now();
    // Identify by authenticated user ID if present, otherwise by client IP
    const clientId = request.user?.id || request.ip || 'anonymous';
    const isAiRoute = request.url.startsWith('/api/ai');

    const store = isAiRoute ? aiStore : generalStore;
    const windowMs = isAiRoute ? AI_WINDOW_MS : GENERAL_WINDOW_MS;
    const maxRequests = isAiRoute ? AI_MAX_REQUESTS : GENERAL_MAX_REQUESTS;

    const bucketKey = `${clientId}:${isAiRoute ? 'ai' : 'gen'}`;
    let bucket = store.get(bucketKey);

    if (!bucket || now > bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      store.set(bucketKey, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    reply.header('X-RateLimit-Limit', maxRequests);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > maxRequests) {
      reply.header('Retry-After', resetSeconds);
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: isAiRoute
          ? `AI rate limit exceeded (${maxRequests} req/min). Please try again in ${resetSeconds}s.`
          : `API rate limit exceeded. Please try again in ${resetSeconds}s.`,
        retryAfter: resetSeconds,
      });
    }
  });
};

(rateLimitPlugin as any)[Symbol.for('skip-override')] = true;
