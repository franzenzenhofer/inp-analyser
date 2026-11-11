import { createServer, type Server } from 'node:http';
import type { Target } from '../model/scenario.js';
import { median } from '../stats/descriptive.js';

/** The sentinel's handler cost. A busy-wait is wall-clock bound, so its INP only moves with machine noise. */
export const SENTINEL_HANDLER_MS = 120;
/** Block invalid when the sentinel deviates from its reference median by more than max(16 ms, 15%) - a heuristic band. */
const TOLERANCE_ABS_MS = 16;
const TOLERANCE_REL = 0.15;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>inp sentinel</title></head>
<body><button id="sentinel" type="button" style="font-size:24px;padding:24px">sentinel</button><p id="out">0</p>
<script>document.getElementById('sentinel').addEventListener('click', function sentinelHandler() {
  const end = performance.now() + ${SENTINEL_HANDLER_MS}; while (performance.now() < end) {}
  const out = document.getElementById('out'); out.textContent = String(Number(out.textContent) + 1);
});</script></body></html>`;

export interface SentinelServer {
  readonly url: string;
  readonly target: Target;
  close(): Promise<void>;
}

export async function startSentinel(): Promise<SentinelServer> {
  const server: Server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGE); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('[sentinel] server has no TCP address');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    target: { id: 'sentinel', selector: '#sentinel', label: 'sentinel', kind: 'button', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: 'sentinel', safety: 'safe', safetyReason: 'local sentinel page' },
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

export interface SentinelVerdict { readonly valid: boolean; readonly valueMs: number; readonly referenceMs: number; readonly toleranceMs: number }

export function judgeSentinel(referenceValues: readonly number[], valueMs: number): SentinelVerdict {
  const referenceMs = median(referenceValues);
  const toleranceMs = Math.max(TOLERANCE_ABS_MS, TOLERANCE_REL * referenceMs);
  return { valid: Math.abs(valueMs - referenceMs) <= toleranceMs, valueMs, referenceMs, toleranceMs };
}
