import Fastify from 'fastify';
import fastifyPostgres from '@fastify/postgres';
import fastifyRedis from '@fastify/redis';
import fastifyCors from '@fastify/cors';
import { urlRoutes } from './routes/url.routes';
import { rateLimiter } from './middleware/rateLimiter';
import fs from 'fs';
import path from 'path';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  },
  trustProxy: true,
  disableRequestLogging: process.env.NODE_ENV === 'production',
  pluginTimeout: 30000, // Increase globally to 30s to prevent boot failures
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

// Database (Postgres)
const databaseUrl = process.env.DATABASE_URL;
fastify.register(fastifyPostgres, {
  connectionString: databaseUrl || 'postgres://user:password@localhost:5432/url_shortener',
  // Required for Render Postgres External Connections
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Cache (Redis)
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  fastify.log.info('Registering Redis connection...');
  // We wrap this in a way that doesn't crash the entire server boot
  fastify.register(async (instance) => {
    try {
      instance.register(fastifyRedis, {
        url: redisUrl,
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
        closeClient: true
      });
    } catch (err: any) {
      instance.log.error('Redis registration deferred error:', err.message);
    }
  });
} else {
  fastify.log.warn('REDIS_URL not found, skipping cache setup');
}

// Health check (with dependency status)
fastify.get('/health', async () => {
  let dbStatus = 'down';
  let cacheStatus = 'down';

  try {
    await fastify.pg.query('SELECT 1');
    dbStatus = 'up';
  } catch (err: any) {
    fastify.log.error('DB Health Check Failed:', err.message);
  }

  try {
    // Gracefully handle if redis is not ready or failed to connect
    if (fastify.redis) {
      await fastify.redis.ping();
      cacheStatus = 'up';
    }
  } catch (err: any) {
    fastify.log.error('Redis Health Check Failed:', err.message);
  }

  return {
    status: dbStatus === 'up' && cacheStatus === 'up' ? 'healthy' : 'degraded',
    version: '1.0.0',
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
