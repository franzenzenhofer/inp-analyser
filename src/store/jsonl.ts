import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { TraceEvent } from '../analysis/trace-engine-adapter.js';
import type { RunRecord } from '../model/run.js';
import { runRecordSchema } from './run-schema.js';

export const RUNS_FILE = 'runs.jsonl';

/** runs.jsonl is the single source of truth: every report is rebuilt from it, and --resume continues it. */
export class RunStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    await mkdir(join(this.dir, 'traces'), { recursive: true });
  }

  async append(record: RunRecord): Promise<void> {
    await appendFile(join(this.dir, RUNS_FILE), `${JSON.stringify(record)}\n`, 'utf8');
  }

  async readAll(): Promise<RunRecord[]> {
    const path = join(this.dir, RUNS_FILE);
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, 'utf8')).split('\n').filter((l) => l.trim() !== '');
    return lines.map((line, i) => {
      const parsed = runRecordSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`[store] ${path} line ${i + 1} is not a valid run record: ${parsed.error.message}`);
      return parsed.data;
    });
  }

  /** Gzipped trace that opens directly in the DevTools Performance panel. Returns the path relative to the run dir. */
  async saveTrace(runId: string, events: readonly TraceEvent[]): Promise<string> {
    const relative = join('traces', `${runId}.json.gz`);
    await writeFile(join(this.dir, relative), gzipSync(JSON.stringify({ traceEvents: events })));
    return relative;
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await writeFile(join(this.dir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async readJson(name: string): Promise<unknown> {
    return JSON.parse(await readFile(join(this.dir, name), 'utf8'));
  }
}
