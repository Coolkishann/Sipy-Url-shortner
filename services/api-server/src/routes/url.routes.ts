import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import { UrlService } from '../services/url.service';
import { validateUrl, sanitizeUrl, isBlocked } from '../utils/urlValidator';

export const urlRoutes = async (fastify: FastifyInstance) => {
  const urlService = new UrlService(fastify);

  // POST /api/shorten — Create short URL
  fastify.post('/api/shorten', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, expiresIn } = request.body as { url: string; expiresIn?: number };

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    const sanitized = sanitizeUrl(url);

    if (!validateUrl(sanitized)) {
      return reply.code(400).send({ error: 'Invalid URL format. Must start with http:// or https://' });
    }

    if (isBlocked(sanitized)) {
      return reply.code(403).send({ error: 'This URL has been blocked' });
    }

    const shortId = nanoid(7);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const record = await urlService.createUrl(shortId, sanitized, request.ip, expiresAt);

    const baseUrl = process.env.BASE_URL || `http://${request.hostname}`;
    return {
      shortUrl: `${baseUrl}/${shortId}`,
      shortId: record.short_id,
      originalUrl: record.original_url,
      createdAt: record.created_at,
      expiresAt: record.expires_at,
    };
  });

  // GET /api/urls — List all URLs (paginated)
  fastify.get('/api/urls', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const result = await urlService.getAllUrls(Number(page), Number(limit));
    return result;
  });

  // GET /api/analytics/:shortId — Get analytics for a URL
  fastify.get('/api/analytics/:shortId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { shortId } = request.params as { shortId: string };
    const analytics = await urlService.getAnalytics(shortId);

    if (!analytics) {
      return reply.code(404).send({ error: 'URL not found' });
    }

    return analytics;
  });

  // GET /api/stats — System-wide stats
  fastify.get('/api/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await urlService.getSystemStats();
    return stats;
  });

  // DELETE /api/urls/:shortId — Deactivate a URL
  fastify.delete('/api/urls/:shortId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { shortId } = request.params as { shortId: string };
    const deleted = await urlService.deleteUrl(shortId);

    if (!deleted) {
      return reply.code(404).send({ error: 'URL not found' });
    }

    return { success: true, message: 'URL deactivated' };
  });

  // GET /:shortId — Redirect to original URL
  fastify.get('/:shortId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { shortId } = request.params as { shortId: string };

    // Don't treat known paths as shortIds
    if (['api', 'health', 'favicon.ico'].includes(shortId)) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const originalUrl = await urlService.getUrl(shortId);

    if (!originalUrl) {
      return reply.code(404).send({ error: 'URL not found or has expired' });
    }

    // Track analytics asynchronously (non-blocking)
    urlService.incrementClickCount(shortId).catch(() => {});
    urlService.recordClick(
      shortId,
      request.headers.referer || '',
      request.headers['user-agent'] || '',
      request.ip
    ).catch(() => {});

    return reply.redirect(301, originalUrl);
  });
};
