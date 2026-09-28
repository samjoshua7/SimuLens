import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { simulationRoutes } from './routes/simulation.js';
import { predictionRoutes } from './routes/prediction.js';
import { interventionRoutes } from './routes/intervention.js';
import { counterfactualRoutes } from './routes/counterfactual.js';
import { validationRoutes } from './routes/validation.js';
import { experimentRoutes } from './routes/experiments.js';
import { aiRoutes } from './routes/ai.js';
import { CausalGraph } from '@simulens/world-model';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rateLimit.js';

dotenv.config({ path: '../../.env' });
dotenv.config();

const port = Number(process.env.PORT) || 8000;
const host = process.env.HOST || '0.0.0.0';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: true, // Allow frontend dev server and production origins (including https://simu-lens.vercel.app)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });

  // Security & Rate Limiting Plugins
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'simulens-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  });

  // Graph topology endpoint
  app.get('/api/causal/graph', async () => {
    const graph = new CausalGraph();
    return graph.getSpec();
  });

  // Register domain & reasoning routes
  await app.register(simulationRoutes, { prefix: '/api/simulation' });
  await app.register(predictionRoutes, { prefix: '/api/prediction' });
  await app.register(interventionRoutes, { prefix: '/api/intervention' });
  await app.register(counterfactualRoutes, { prefix: '/api/counterfactual' });
  await app.register(validationRoutes, { prefix: '/api/validation' });
  await app.register(experimentRoutes, { prefix: '/api/experiments' });
  await app.register(aiRoutes, { prefix: '/api/ai' });

  return app;
}

async function start() {
  try {
    const server = await buildApp();
    await server.listen({ port, host });
    console.log(`\n======================================================`);
    console.log(`🚀 SimuLens Fastify API Server running at http://${host}:${port}`);
    console.log(`   Health: http://${host}:${port}/health`);
    console.log(`   Causal Graph: http://${host}:${port}/api/causal/graph`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Failed to start SimuLens API server:', err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  start();
}
