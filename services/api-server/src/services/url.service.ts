import { FastifyInstance } from 'fastify';

export interface UrlRecord {
  id: number;
  short_id: string;
  original_url: string;
  created_at: string;
  expires_at: string | null;
  click_count: number;
  is_active: boolean;
}

export interface AnalyticsRecord {
  short_id: string;
  clicked_at: string;
  referrer: string;
  user_agent: string;
  ip_address: string;
  country: string;
  device_type: string;
}

export class UrlService {
  constructor(private fastify: FastifyInstance) {}

  async createUrl(shortId: string, originalUrl: string, creatorIp: string, expiresAt?: Date): Promise<UrlRecord> {
    const { rows } = await this.fastify.pg.query(
      `INSERT INTO urls (short_id, original_url, creator_ip, expires_at) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [shortId, originalUrl, creatorIp, expiresAt || null]
    );

    // Cache in Redis for 24h
    await this.fastify.redis.set(shortId, originalUrl, 'EX', 86400);

    return rows[0];
  }

  async getUrl(shortId: string): Promise<string | null> {
    // 1. Check Redis cache first
    const cached = await this.fastify.redis.get(shortId);
    if (cached) return cached;

    // 2. Check Postgres
    const { rows } = await this.fastify.pg.query(
      `SELECT original_url, expires_at, is_active FROM urls 
       WHERE short_id = $1`,
      [shortId]
    );

    if (rows.length === 0) return null;

    const record = rows[0];

    // Check if expired
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return null;
    }

    // Check if active
    if (!record.is_active) return null;

    // Cache the result
    await this.fastify.redis.set(shortId, record.original_url, 'EX', 86400);

    return record.original_url;
  }

  async incrementClickCount(shortId: string): Promise<void> {
    await this.fastify.pg.query(
      `UPDATE urls SET click_count = click_count + 1 WHERE short_id = $1`,
      [shortId]
    );
  }

  async recordClick(shortId: string, referrer: string, userAgent: string, ip: string): Promise<void> {
    const deviceType = this.detectDevice(userAgent);
    await this.fastify.pg.query(
      `INSERT INTO url_analytics (short_id, referrer, user_agent, ip_address, device_type) 
       VALUES ($1, $2, $3, $4, $5)`,
      [shortId, referrer || 'direct', userAgent, ip, deviceType]
    );
  }

  async getAnalytics(shortId: string): Promise<{
    url: UrlRecord;
    totalClicks: number;
    clicksByDevice: Record<string, number>;
    clicksByDay: { date: string; clicks: number }[];
    recentClicks: AnalyticsRecord[];
  } | null> {
    // Get URL info
    const { rows: urlRows } = await this.fastify.pg.query(
      `SELECT * FROM urls WHERE short_id = $1`,
      [shortId]
    );
    if (urlRows.length === 0) return null;

    // Get total clicks
    const { rows: totalRows } = await this.fastify.pg.query(
      `SELECT COUNT(*) as total FROM url_analytics WHERE short_id = $1`,
      [shortId]
    );

    // Get clicks by device
    const { rows: deviceRows } = await this.fastify.pg.query(
      `SELECT device_type, COUNT(*) as count 
       FROM url_analytics WHERE short_id = $1 
       GROUP BY device_type`,
      [shortId]
    );

    // Get clicks per day (last 30 days)
    const { rows: dayRows } = await this.fastify.pg.query(
      `SELECT DATE(clicked_at) as date, COUNT(*) as clicks 
       FROM url_analytics 
       WHERE short_id = $1 AND clicked_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(clicked_at) 
       ORDER BY date DESC`,
      [shortId]
    );

    // Get recent clicks
    const { rows: recentRows } = await this.fastify.pg.query(
      `SELECT * FROM url_analytics 
       WHERE short_id = $1 
       ORDER BY clicked_at DESC LIMIT 20`,
      [shortId]
    );

    const clicksByDevice: Record<string, number> = {};
    deviceRows.forEach((row: any) => {
      clicksByDevice[row.device_type] = parseInt(row.count);
    });

    return {
      url: urlRows[0],
      totalClicks: parseInt(totalRows[0].total),
      clicksByDevice,
      clicksByDay: dayRows.map((row: any) => ({
        date: row.date,
        clicks: parseInt(row.clicks),
      })),
      recentClicks: recentRows,
    };
  }

  async getAllUrls(page: number = 1, limit: number = 20): Promise<{ urls: UrlRecord[]; total: number }> {
    const offset = (page - 1) * limit;

    const { rows: countRows } = await this.fastify.pg.query(
      `SELECT COUNT(*) as total FROM urls`
    );

    const { rows } = await this.fastify.pg.query(
      `SELECT * FROM urls ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      urls: rows,
      total: parseInt(countRows[0].total),
    };
  }

  async deleteUrl(shortId: string): Promise<boolean> {
    const { rowCount } = await this.fastify.pg.query(
      `UPDATE urls SET is_active = FALSE WHERE short_id = $1`,
      [shortId]
    );
    // Remove from cache
    await this.fastify.redis.del(shortId);
    return (rowCount ?? 0) > 0;
  }

  async getSystemStats(): Promise<{
    totalUrls: number;
    activeUrls: number;
    totalClicks: number;
    urlsToday: number;
    clicksToday: number;
  }> {
    const { rows } = await this.fastify.pg.query(`
      SELECT
        (SELECT COUNT(*) FROM urls) as total_urls,
        (SELECT COUNT(*) FROM urls WHERE is_active = TRUE) as active_urls,
        (SELECT COALESCE(SUM(click_count), 0) FROM urls) as total_clicks,
        (SELECT COUNT(*) FROM urls WHERE DATE(created_at) = CURRENT_DATE) as urls_today,
        (SELECT COUNT(*) FROM url_analytics WHERE DATE(clicked_at) = CURRENT_DATE) as clicks_today
    `);

    return {
      totalUrls: parseInt(rows[0].total_urls),
      activeUrls: parseInt(rows[0].active_urls),
      totalClicks: parseInt(rows[0].total_clicks),
      urlsToday: parseInt(rows[0].urls_today),
      clicksToday: parseInt(rows[0].clicks_today),
    };
  }

  private detectDevice(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
    if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
    return 'desktop';
  }
}
