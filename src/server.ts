import http from 'http';
import { Cache } from './core/index.js';

// Initialize cache with 10MB max memory and LFU eviction
const cache = new Cache({
  maxmemory: 10_000_000,
  evictionPolicy: 'lfu'
});

/**
 * Parse JSON body from request
 */
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res: http.ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse query string
 */
function parseQuery(url: string): Record<string, string> {
  const queryIdx = url.indexOf('?');
  if (queryIdx === -1) return {};

  const params: Record<string, string> = {};
  const queryString = url.slice(queryIdx + 1);
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return params;
}

/**
 * Request router
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const { method, url } = req;
  if (!url) {
    return sendJSON(res, 400, { error: 'Invalid URL' });
  }

  const path = url.split('?')[0];

  try {
    // Health check
    if (path === '/health' && method === 'GET') {
      return sendJSON(res, 200, { ok: true });
    }

    // SET key value [PX milliseconds]
    if (path === '/set' && method === 'POST') {
      const { key, value, px } = await parseBody(req);
      if (!key || value === undefined) {
        return sendJSON(res, 400, { error: 'Missing key or value' });
      }
      cache.set(key, value, px);
      return sendJSON(res, 200, { ok: true });
    }

    // GET key
    if (path === '/get' && method === 'GET') {
      const { key } = parseQuery(url);
      if (!key) {
        return sendJSON(res, 400, { error: 'Missing key' });
      }
      try {
        const value = cache.get(key);
        return sendJSON(res, 200, { value });
      } catch (err: any) {
        if (err.message === 'WRONGTYPE') {
          return sendJSON(res, 400, { error: 'WRONGTYPE' });
        }
        throw err;
      }
    }

    // DEL key
    if (path === '/del' && method === 'POST') {
      const { key } = await parseBody(req);
      if (!key) {
        return sendJSON(res, 400, { error: 'Missing key' });
      }
      const deleted = cache.del(key);
      return sendJSON(res, 200, { deleted });
    }

    // ZADD key score member
    if (path === '/zadd' && method === 'POST') {
      const { key, score, member } = await parseBody(req);
      if (!key || score === undefined || member === undefined) {
        return sendJSON(res, 400, { error: 'Missing key, score, or member' });
      }
      try {
        const added = cache.zadd(key, Number(score), member);
        return sendJSON(res, 200, { added });
      } catch (err: any) {
        if (err.message === 'WRONGTYPE') {
          return sendJSON(res, 400, { error: 'WRONGTYPE' });
        }
        throw err;
      }
    }

    // ZREM key member
    if (path === '/zrem' && method === 'POST') {
      const { key, member } = await parseBody(req);
      if (!key || member === undefined) {
        return sendJSON(res, 400, { error: 'Missing key or member' });
      }
      try {
        const removed = cache.zrem(key, member);
        return sendJSON(res, 200, { removed });
      } catch (err: any) {
        if (err.message === 'WRONGTYPE') {
          return sendJSON(res, 400, { error: 'WRONGTYPE' });
        }
        throw err;
      }
    }

    // ZSCORE key member
    if (path === '/zscore' && method === 'GET') {
      const { key, member } = parseQuery(url);
      if (!key || !member) {
        return sendJSON(res, 400, { error: 'Missing key or member' });
      }
      try {
        const score = cache.zscore(key, member);
        return sendJSON(res, 200, { score });
      } catch (err: any) {
        if (err.message === 'WRONGTYPE') {
          return sendJSON(res, 400, { error: 'WRONGTYPE' });
        }
        throw err;
      }
    }

    // ZRANGEBYSCORE key min max [LIMIT count]
    if (path === '/zrangeByScore' && method === 'GET') {
      const { key, min, max, limit } = parseQuery(url);
      if (!key || min === undefined || max === undefined) {
        return sendJSON(res, 400, { error: 'Missing key, min, or max' });
      }
      try {
        const items = cache.zrangeByScore(
          key,
          Number(min),
          Number(max),
          limit ? Number(limit) : undefined
        );
        return sendJSON(res, 200, { items });
      } catch (err: any) {
        if (err.message === 'WRONGTYPE') {
          return sendJSON(res, 400, { error: 'WRONGTYPE' });
        }
        throw err;
      }
    }

    // Not found
    return sendJSON(res, 404, { error: 'Not found' });

  } catch (err) {
    console.error('Error handling request:', err);
    return sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// Create and start server
const PORT = process.env.PORT || 7379;
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`Cache server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    cache.shutdown();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    cache.shutdown();
    process.exit(0);
  });
});