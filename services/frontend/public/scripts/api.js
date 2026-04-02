// ═══════════════════════════════════════════════
// API Client — Snip URL Shortener
// ═══════════════════════════════════════════════

const BASE_URL = '/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const response = await fetch(url, config);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── Endpoints ───

export async function shortenUrl(url, expiresIn) {
  const body = { url };
  if (expiresIn) body.expiresIn = parseInt(expiresIn);
  return request('/shorten', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getUrls(page = 1, limit = 20) {
  return request(`/urls?page=${page}&limit=${limit}`);
}

export async function getAnalytics(shortId) {
  return request(`/analytics/${shortId}`);
}

export async function getStats() {
  return request('/stats');
}

export async function deleteUrl(shortId) {
  return request(`/urls/${shortId}`, { method: 'DELETE' });
}

export async function getHealth() {
  const response = await fetch('/health');
  return response.json();
}
