import http, { IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';

interface ServerTarget {
  url: string;
  healthy: boolean;
  activeConnections: number;
  lastChecked: number;
}

// ─── Configuration ───
const HEALTH_CHECK_INTERVAL = 5000; // 5s
const HEALTH_CHECK_PATH = '/health';
// Parse servers from environment
const serverUrls = (process.env.API_SERVERS || 'http://localhost:3000').split(',');
const servers: ServerTarget[] = serverUrls.map(url => {
  let finalUrl = url.trim();
  // If no port is specified and it's an internal Render hostname, default to 3000
  if (!finalUrl.includes(':', 7)) { // Ignore the : in http://
    finalUrl = `${finalUrl}:3000`;
  }
  return {
    url: finalUrl,
    healthy: true,
    activeConnections: 0,
    lastChecked: new Date(0).getTime(),
  };
});

let currentIndex = 0;

// ─── Load Balancing Strategies ───

function roundRobin(): ServerTarget | null {
  const healthyServers = servers.filter(s => s.healthy);
  if (healthyServers.length === 0) return null;

  const server = healthyServers[currentIndex % healthyServers.length];
  currentIndex++;
  return server;
}

function leastConnections(): ServerTarget | null {
  const healthyServers = servers.filter(s => s.healthy);
  if (healthyServers.length === 0) return null;

  return healthyServers.reduce((min, s) =>
    s.activeConnections < min.activeConnections ? s : min
  );
}

// Pick strategy from env (default: least-connections)
const STRATEGY = process.env.LB_STRATEGY || 'least-connections';
const getNextServer = STRATEGY === 'round-robin' ? roundRobin : leastConnections;

// ─── Health Checking ───

async function checkHealth(server: ServerTarget): Promise<void> {
  return new Promise((resolve) => {
    const url = new URL(HEALTH_CHECK_PATH, server.url);
    const req = http.get(url.toString(), { timeout: 3000 }, (res) => {
      server.healthy = res.statusCode === 200;
      server.lastChecked = Date.now();
      res.resume();
      resolve();
    });

    req.on('error', () => {
      server.healthy = false;
      server.lastChecked = Date.now();
      resolve();
    });

    req.on('timeout', () => {
      server.healthy = false;
      server.lastChecked = Date.now();
      req.destroy();
      resolve();
    });
  });
}

async function healthCheckLoop(): Promise<void> {
  while (true) {
    await Promise.all(servers.map(checkHealth));
    const healthy = servers.filter(s => s.healthy).length;
    console.log(`[HealthCheck] ${healthy}/${servers.length} servers healthy`);
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL));
  }
}

// ─── Proxy Server ───

const proxy = httpProxy.createProxyServer({
  changeOrigin: true, 
  secure: true,
  timeout: 30000,
  proxyTimeout: 30000,
});

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const healthyServers = servers.filter(s => s.healthy);

  if (healthyServers.length === 0) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      error: 'Service Unavailable', 
      message: 'No healthy backends. Check API_SERVERS environment variable.',
      checked: servers.length,
      config: process.env.API_SERVERS?.substring(0, 20) + '...'
    }));
  }

  // Strategy: Least Connections (default)
  const target = healthyServers.reduce((prev, curr) => 
    (prev.activeConnections < curr.activeConnections) ? prev : curr
  );

  target.activeConnections++;
  const start = Date.now();

  proxy.web(req, res, { 
    target: target.url,
    headers: { host: new URL(target.url).host } 
  }, (err: Error) => {
    console.error(`[LB] Proxy error to ${target.url}:`, err.message);
    target.activeConnections--;
    target.healthy = false;
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  res.on('finish', () => {
    target.activeConnections--;
    const duration = Date.now() - start;
    console.log(`[LB] Routed to ${target.url} | Status: ${res.statusCode} | Duration: ${duration}ms`);
  });
});

// ─── Admin endpoint for LB status ───
const adminServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      strategy: STRATEGY,
      servers: servers.map(s => ({
        url: s.url,
        healthy: s.healthy,
        activeConnections: s.activeConnections,
        lastChecked: new Date(s.lastChecked).toISOString(),
      })),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ─── Start ───

const PORT = parseInt(process.env.PORT || '8080');
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '8081');

server.listen(PORT, () => {
  console.log(`[LB] Load Balancer running on port ${PORT}`);
  console.log(`[LB] Strategy: ${STRATEGY}`);
  console.log(`[LB] Backends: ${servers.map(s => s.url).join(', ')}`);
});

adminServer.listen(ADMIN_PORT, () => {
  console.log(`[LB] Admin panel on port ${ADMIN_PORT}/status`);
});

healthCheckLoop();
