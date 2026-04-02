import Fastify from 'fastify';
import fastifyPostgres from '@fastify/postgres';
import fastifyRedis from '@fastify/redis';
import fastifyCors from '@fastify/cors';
import { urlRoutes } from './routes/url.routes';
import { rateLimiter } from './middleware/rateLimiter';
import fs from 'fs';
import path from 'path';

const fastify = Fastify({
  logger: true,
  trustProxy: true,
  disableRequestLogging: process.env.NODE_ENV === 'production',
});

// CORS — allow frontend
fastify.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

// Rate Limiting
fastify.addHook('onRequest', rateLimiter({
  maxRequests: parseInt(process.env.RATE_LIMIT || '100'),
  windowMs: 60 * 1000,
}));

// Database
fastify.register(fastifyPostgres, {
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/url_shortener',
});

// Cache
// fastify.register(fastifyRedis, {
//   host: process.env.REDIS_HOST || '127.0.0.1',
//   port: parseInt(process.env.REDIS_PORT || '6379'),
//   password: process.env.REDIS_PASSWORD,
// });
fastify.register(fastifyRedis, {
  url: process.env.REDIS_URL
});

// Health check (with dependency status)
fastify.get('/health', async () => {
  let dbStatus = 'down';
  let cacheStatus = 'down';

  try {
    await fastify.pg.query('SELECT 1');
    dbStatus = 'up';
  } catch {}

  try {
    await fastify.redis.ping();
    cacheStatus = 'up';
  } catch {}

  return {
    status: dbStatus === 'up' && cacheStatus === 'up' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      cache: cacheStatus,
    },
    uptime: process.uptime(),
  };
});

// URL Routes
fastify.register(urlRoutes);

// Database Initialization
const initDB = async () => {
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await fastify.pg.query(schema);
  fastify.log.info('Database schema initialized');
};

const PORT = parseInt(process.env.PORT || '3000');

const start = async () => {
  try {
    await fastify.ready();
    await initDB();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`API Server running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
