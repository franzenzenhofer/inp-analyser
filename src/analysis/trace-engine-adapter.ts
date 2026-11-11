import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as Trace from '@paulirish/trace_engine';
import { ensureDomRect } from './dom-rect-polyfill.js';

/**
 * The only file that talks to @paulirish/trace_engine (pinned 0.0.66, "API is not stable"):
 * https://www.npmjs.com/package/@paulirish/trace_engine
 */
export type ParsedTrace = Trace.TraceModel.ParsedTrace;
export type TraceEvent = Trace.Types.Events.Event;
export { Trace };

const GZIP_MAGIC = [0x1f, 0x8b] as const;

function isGzip(buf: Buffer): boolean {
  return buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1];
}

/** Structural check of the Trace Event Format fields the engine relies on. */
function isTraceEvent(value: unknown): value is TraceEvent {
  if (typeof value !== 'object' || value === null) return false;
  return 'name' in value && typeof value.name === 'string' && 'ph' in value && typeof value.ph === 'string';
}

function eventArray(json: unknown): unknown {
  if (typeof json === 'object' && json !== null && 'traceEvents' in json) return json.traceEvents;
  return json;
}

function eventsFromJson(json: unknown, source: string): TraceEvent[] {
  const events = eventArray(json);
  if (!Array.isArray(events)) {
    throw new Error(`[trace] ${source} is neither a trace event array nor {traceEvents: [...]}`);
  }
  const valid = events.filter(isTraceEvent);
  if (valid.length !== events.length) {
    throw new Error(`[trace] ${source}: ${events.length - valid.length} entries are not trace events`);
  }
  return valid;
}

export async function loadTraceEvents(path: string): Promise<TraceEvent[]> {
  const buf = await readFile(path);
  const text = isGzip(buf) ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return eventsFromJson(JSON.parse(text), path);
}

export async function parseTrace(events: readonly TraceEvent[]): Promise<ParsedTrace> {
  ensureDomRect();
  const model = Trace.TraceModel.Model.createWithAllHandlers();
  await model.parse(events);
  const parsed = model.parsedTrace();
  if (parsed === null) {
    throw new Error('[trace] trace engine produced no parsed trace');
  }
  return parsed;
}
