/**
 * Dev API Server - chạy port 3001, handle /api/* requests
 * Dùng tsx để chạy trực tiếp TypeScript.
 * Env vars are loaded via --env-file flag.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

const PORT = 3001;

// Route map → handler file (dynamic import)
const ROUTES: Record<string, string> = {
  '/api/auth/register': './api/auth/register.ts',
  '/api/auth/login': './api/auth/login.ts',
  '/api/auth/me': './api/auth/me.ts',
  '/api/check-signals': './api/check-signals.ts',
  '/api/kl-signals': './api/kl-signals.ts',
  '/api/scan': './api/scan.ts',
  '/api/ai-analyze': './api/ai-analyze.ts',
  '/api/auto-scan': './api/auto-scan.ts',
  '/api/test-telegram': './api/test-telegram.ts',
  '/api/notify': './api/notify.ts',
};

async function loadHandler(path: string): Promise<((req: any, res: any) => Promise<void>) | null> {
  if (!path) return null;
  try {
    const mod = await import(path);
    return mod.default;
  } catch (err) {
    console.error(`Failed to load ${path}:`, err);
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve(undefined); }
    });
  });
}

function setCORS(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = createServer(async (req, res) => {
  setCORS(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const handler = await loadHandler(ROUTES[url.pathname] || '');

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Route not found: ${url.pathname}` }));
    return;
  }

  // Build fake VercelRequest
  const body = (req.method !== 'GET' && req.method !== 'HEAD') ? await readBody(req) : undefined;
  const fakeReq: any = {
    method: req.method,
    headers: req.headers,
    body,
    query: Object.fromEntries(url.searchParams),
    url: req.url,
  };

  // Build fake VercelResponse
  const fakeRes: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) {
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    send(data: string) {
      res.writeHead(this.statusCode, { 'Content-Type': 'text/plain' });
      res.end(data);
    },
    setHeader(k: string, v: string) { res.setHeader(k, v); return this; },
  };

  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    console.error(`Error in ${url.pathname}:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', detail: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 CRAZII Dev API: http://localhost:${PORT}\n`);
  console.log('   Routes:');
  Object.keys(ROUTES).forEach((r) => console.log(`   ${r}`));
  console.log('');
});
