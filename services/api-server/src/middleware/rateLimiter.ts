import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

export const rateLimiter = (config: RateLimitConfig = DEFAULT_CONFIG) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  // Cleanup expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requests.entries()) {
      if (now > value.resetTime) {
        requests.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const entry = requests.get(ip);

    if (!entry || now > entry.resetTime) {
      requests.set(ip, { count: 1, resetTime: now + config.windowMs });
      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', config.maxRequests - 1);
      return;
    }

    entry.count++;

    if (entry.count > config.maxRequests) {
      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', 0);
      reply.header('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return reply.code(429).send({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', config.maxRequests - entry.count);
  };
};
