import { readFile } from 'node:fs/promises';
import type { BrowserContext, CookieData, Page } from 'puppeteer-core';
import { z } from 'zod';

/**
 * A stored "consent given" state (cookies + localStorage per origin), captured once after clicking the
 * banner's accept button. Seeded into every fresh measurement context so returning-visitor pages can be
 * measured without the consent overlay swallowing every tap ("input landed on another element").
 */
const consentStateSchema = z.object({
  capturedFrom: z.string().min(1),
  cookies: z.array(z.object({
    name: z.string().min(1), value: z.string(), domain: z.string().min(1), path: z.string().min(1),
    secure: z.boolean(), httpOnly: z.boolean(), sameSite: z.enum(['Strict', 'Lax', 'None']).optional(), expires: z.number().optional(),
  })),
  localStorage: z.record(z.string(), z.record(z.string(), z.string())),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

export async function loadConsentState(path: string): Promise<ConsentState> {
  return consentStateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

/** Runs in the page before any page script (evaluateOnNewDocument): self-contained, no named inner functions. */
export function seedLocalStorage(byOrigin: Readonly<Record<string, Readonly<Record<string, string>>>>): void {
  const items = byOrigin[location.origin];
  if (items === undefined) return;
  for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
}

/** Before the first navigation of a fresh context: cookies into the context, localStorage via a pre-script. */
export async function applyConsentState(context: BrowserContext, page: Page, state: ConsentState): Promise<void> {
  const cookies: CookieData[] = state.cookies.map(({ sameSite, expires, ...rest }) => ({
    ...rest, ...(sameSite === undefined ? {} : { sameSite }), ...(expires === undefined ? {} : { expires }),
  }));
  await context.setCookie(...cookies);
  await page.evaluateOnNewDocument(seedLocalStorage, state.localStorage);
}
