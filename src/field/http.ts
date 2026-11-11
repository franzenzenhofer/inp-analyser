import { z } from 'zod';

/** Env var that carries the Google API key for CrUX, CrUX History and PageSpeed Insights. */
export const API_KEY_ENV = 'INP_GOOGLE_API_KEY';

const KEY_HELP =
  `Set ${API_KEY_ENV} to a Google API key whose Cloud project has the "Chrome UX Report API" ` +
  '(https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com) and the ' +
  '"PageSpeed Insights API" (https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com) enabled. ' +
  'Create or copy the key at https://console.cloud.google.com/apis/credentials.';

/** Reads the Google API key from the environment. Throws with instructions when it is missing. */
export function readGoogleApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env[API_KEY_ENV]?.trim() ?? '';
  if (key.length === 0) throw new Error(`Missing ${API_KEY_ENV}. ${KEY_HELP}`);
  return key;
}

/** A Google API answered with an unexpected HTTP status (after the single documented retry). */
export class FieldApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(label: string, status: number, body: string) {
    super(`${label} failed with HTTP ${status}: ${body.slice(0, 600)}`);
    this.name = 'FieldApiError';
    this.status = status;
    this.body = body;
  }
}

export interface JsonRequest {
  /** Short name for error messages, e.g. "CrUX queryRecord". */
  readonly label: string;
  readonly url: URL;
  /** Present = POST with this JSON body, absent = GET. */
  readonly body?: unknown;
  readonly timeoutMs: number;
}

export interface JsonResponse {
  readonly status: number;
  readonly json: unknown;
}

/**
 * One retry on HTTP 429 and 5xx only, after Retry-After (seconds) or this backoff.
 * CrUX quota is 150 queries/minute per project (https://developer.chrome.com/docs/crux/api#rate-limits);
 * a second failure is raised, never hidden.
 */
const RETRY_BACKOFF_MS = 3000;
const MAX_RETRY_AFTER_MS = 30_000;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  return RETRY_BACKOFF_MS;
}

function redactKey(url: URL): string {
  const copy = new URL(url);
  if (copy.searchParams.has('key')) copy.searchParams.set('key', 'REDACTED');
  return copy.toString();
}

async function send(request: JsonRequest): Promise<Response> {
  const init: RequestInit = { signal: AbortSignal.timeout(request.timeoutMs) };
  if (request.body !== undefined) {
    init.method = 'POST';
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(request.body);
  }
  try {
    return await fetch(request.url, init);
  } catch (error) {
    throw new Error(`${request.label} request to ${redactKey(request.url)} failed`, { cause: error });
  }
}

async function readJson(request: JsonRequest, response: Response): Promise<JsonResponse> {
  const text = await response.text();
  try {
    return { status: response.status, json: JSON.parse(text) as unknown };
  } catch (error) {
    throw new Error(`${request.label} HTTP ${response.status} returned a non-JSON body: ${text.slice(0, 600)}`, { cause: error });
  }
}

/**
 * Sends the request and returns status + parsed JSON for 2xx and for the statuses in `acceptStatuses`
 * (e.g. 404 = CrUX "no data"). Every other status throws FieldApiError.
 */
export async function requestJson(request: JsonRequest, acceptStatuses: readonly number[] = []): Promise<JsonResponse> {
  let response = await send(request);
  if (isRetryable(response.status)) {
    const delay = retryDelayMs(response);
    console.warn(`[field] ${request.label} HTTP ${response.status}, one retry in ${delay} ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    response = await send(request);
  }
  if (response.ok || acceptStatuses.includes(response.status)) return readJson(request, response);
  throw new FieldApiError(request.label, response.status, await response.text());
}

/** Validates an API payload with zod; a shape mismatch throws with the exact paths that failed. */
export function parseApi<T extends z.ZodType>(schema: T, json: unknown, label: string): z.output<T> {
  const result = schema.safeParse(json);
  if (result.success) return result.data;
  throw new Error(`${label} returned an unexpected shape:\n${z.prettifyError(result.error)}`);
}
