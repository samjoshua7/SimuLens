import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { supabaseService } from '../services/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// Routes that do not require authentication
const PUBLIC_PREFIXES = ['/health', '/api/causal/graph'];

export const authPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Allow CORS preflight requests
    if (request.method === 'OPTIONS') {
      return;
    }

    // 2. Allow public health & metadata routes
    const url = request.url.split('?')[0];
    if (PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix + '/'))) {
      return;
    }

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    const supabase = supabaseService.getClient();
    const isProduction = process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true';

    // 3. If a Bearer token is provided, verify it via Supabase Auth
    if (token) {
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (error || !user) {
            request.log.warn({ err: error?.message }, '[AuthPlugin] Invalid or expired bearer token');
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'Invalid or expired authentication token',
            });
          }

          request.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
          return;
        } catch (err: any) {
          request.log.error({ err: err?.message }, '[AuthPlugin] Exception while verifying token with Supabase');
          if (isProduction) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'Failed to verify authentication credentials',
            });
          }
        }
      } else {
        // Token provided, but Supabase client is operating in local fallback mode
        request.user = {
          id: 'dev-authenticated-user',
          email: 'dev@simulens.local',
          role: 'authenticated',
        };
        return;
      }
    }

    // 4. No token provided: Enforce in production, allow mock user in dev if REQUIRE_AUTH is not explicitly true
    if (isProduction && supabase) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authorization header with Bearer token is required',
      });
    }

    // Local development fallback
    request.user = {
      id: 'local-dev-user',
      email: 'dev@simulens.local',
      role: 'authenticated',
    };
  });
};

(authPlugin as any)[Symbol.for('skip-override')] = true;
