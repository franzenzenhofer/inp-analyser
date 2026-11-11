import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

/** First-party and third-party hosts; Chrome maps them to 127.0.0.1 via --host-resolver-rules. */
export const FIRST_PARTY_HOST = 'site.inp.test';
export const THIRD_PARTY_HOST = 'cdn.thirdparty.test';

const ROOT = import.meta.dirname;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export interface TestSite {
  readonly port: number;
  readonly origin: string;
  readonly thirdPartyOrigin: string;
  readonly hostResolverRule: string;
  readonly requests: readonly string[];
  close(): Promise<void>;
}

function folderFor(host: string): string {
  return host.startsWith(THIRD_PARTY_HOST) ? 'third-party' : 'pages';
}

/** Fixed server wait for /api/slow-sync, the cost a synchronous XHR blocks the main thread with. */
export const SLOW_SYNC_DELAY_MS = 300;
const BOT_CHALLENGE_BODY = '<!doctype html><meta name="inp-expect" content="bot-wall; target=#challenge-running; phase=context; 403 challenge page, the tool must fail loud">'
  + '<title>Just a moment...</title><div id="challenge-running"></div>';
const DOWNLOAD_BODY = 'id,value\n1,report\n';

type Route = (res: ServerResponse) => void;
const ROUTES: Readonly<Record<string, Route>> = {
  '/bot-challenge': (res) => void res.writeHead(403, { 'content-type': 'text/html' }).end(BOT_CHALLENGE_BODY),
  '/download/report.csv': (res) => void res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="report.csv"' }).end(DOWNLOAD_BODY),
  '/api/slow-sync': (res) => void setTimeout(() => res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{"ok":true}'), SLOW_SYNC_DELAY_MS),
};

async function serveFile(host: string, pathname: string, res: ServerResponse): Promise<void> {
  const file = pathname === '/' ? '/index.html' : pathname;
  const path = normalize(join(ROOT, folderFor(host), file.endsWith('.js') || file.endsWith('.css') ? file : `${file.replace(/\.html$/, '')}.html`));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'timing-allow-origin': '*' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${pathname}`);
  }
}

async function respond(req: IncomingMessage, res: ServerResponse, log: string[]): Promise<void> {
  const host = req.headers.host ?? '';
  const url = new URL(req.url ?? '/', `http://${host}`);
  log.push(`${req.method ?? 'GET'} ${host}${url.pathname}`);
  const route = ROUTES[url.pathname];
  if (route !== undefined) {
    route(res);
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(204).end();
    return;
  }
  await serveFile(host, url.pathname, res);
}

export async function startTestSite(): Promise<TestSite> {
  const log: string[] = [];
  const server = createServer((req, res) => void respond(req, res, log));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`[test-site] unexpected server address: ${String(address)}`);
  }
  const { port } = address;
  return {
    port,
    origin: `http://${FIRST_PARTY_HOST}:${port}`,
    thirdPartyOrigin: `http://${THIRD_PARTY_HOST}:${port}`,
    hostResolverRule: `MAP ${FIRST_PARTY_HOST} 127.0.0.1, MAP ${THIRD_PARTY_HOST} 127.0.0.1`,
    requests: log,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
