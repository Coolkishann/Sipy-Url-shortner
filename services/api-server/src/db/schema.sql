-- URL Shortener Schema
-- Core table for URL mappings
CREATE TABLE IF NOT EXISTS urls (
  id SERIAL PRIMARY KEY,
  short_id VARCHAR(10) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  click_count INTEGER DEFAULT 0,
  creator_ip VARCHAR(45),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_short_id ON urls(short_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON urls(created_at);

-- Analytics table for click tracking
CREATE TABLE IF NOT EXISTS url_analytics (
  id SERIAL PRIMARY KEY,
  short_id VARCHAR(10) NOT NULL REFERENCES urls(short_id),
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  referrer TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),
  country VARCHAR(100),
  device_type VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_analytics_short_id ON url_analytics(short_id);
CREATE INDEX IF NOT EXISTS idx_analytics_clicked_at ON url_analytics(clicked_at);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);
