/**
 * Escaping for the HTML report. Labels, selectors and URLs come from untrusted pages, so every value goes
 * through `html` (escapes text) and only `SafeHtml` built here is ever emitted unescaped.
 */
export class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

export type HtmlPart = string | number | SafeHtml | readonly SafeHtml[];

const ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

function partToString(part: HtmlPart): string {
  if (part instanceof SafeHtml) return part.value;
  if (typeof part === 'string') return escapeHtml(part);
  if (typeof part === 'number') {
    if (!Number.isFinite(part)) throw new Error(`[html] refusing to render non-finite number ${part}`);
    return String(part);
  }
  return part.map((p) => p.value).join('');
}

/** Tagged template: the literal parts are trusted markup, every interpolated value is escaped. */
export function html(strings: TemplateStringsArray, ...parts: readonly HtmlPart[]): SafeHtml {
  let out = strings[0] ?? '';
  parts.forEach((part, i) => {
    out += partToString(part) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}

/** Trusted constant markup (the report's own CSS); never pass report data here. */
export function trusted(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

/** Only http(s) URLs become links; anything else (javascript:, data:) is shown as text. */
export function link(url: string, text: string = url): SafeHtml {
  const isWeb = URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol);
  return isWeb ? html`<a href="${url}">${text}</a>` : html`<code>${text}</code>`;
}

export function join(parts: readonly SafeHtml[]): SafeHtml {
  return new SafeHtml(parts.map((p) => p.value).join(''));
}

/** A table with a header row; cells are already-safe fragments. Wrapped so wide tables scroll, never shrink. */
export function table(headers: readonly string[], rows: readonly (readonly HtmlPart[])[], caption: string): SafeHtml {
  const head = join(headers.map((h) => html`<th scope="col">${h}</th>`));
  const body = join(rows.map((row) => html`<tr>${join(row.map((cell) => html`<td>${cell}</td>`))}</tr>`));
  return html`<div class="scroll" role="region" aria-label="${caption}" tabindex="0"><table><caption>${caption}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
