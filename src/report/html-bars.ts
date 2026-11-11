import type { RatingDensities } from '../field/crux-schema.js';
import { html, join, type SafeHtml } from './html-escape.js';
import type { Bucket } from './reconcile.js';
import { BUCKET_LABEL, BUCKET_RANGE, BUCKETS, percent } from './render-format.js';

export interface BucketShares {
  readonly shares: Readonly<Record<Bucket, number>>;
  /** Legend text per bucket after the label, e.g. "81.0%" or "2 of 3 scenarios". */
  readonly legend: Readonly<Record<Bucket, string>>;
  readonly title: string;
}

export function densityShares(d: RatingDensities, title: string): BucketShares {
  const shares = { good: d.good, 'needs-improvement': d.needsImprovement, poor: d.poor };
  return { shares, legend: { good: percent(d.good), 'needs-improvement': percent(d.needsImprovement), poor: percent(d.poor) }, title };
}

/**
 * Stacked good / needs improvement / poor bar: status colours, 2px surface gaps, values in the legend below
 * (segments are often too narrow for a 16px label) and in each segment's native tooltip.
 */
export function bucketBar(input: BucketShares): SafeHtml {
  const segments = BUCKETS.filter((b) => input.shares[b] > 0).map((b) => {
    const tip = `${BUCKET_LABEL[b]} (${BUCKET_RANGE[b]}): ${input.legend[b]}`;
    return html`<span class="${b}" style="flex-grow: ${input.shares[b]}" title="${tip}"></span>`;
  });
  const legend = BUCKETS.map((b) => html`<li><span class="dot ${b}"></span>${BUCKET_LABEL[b]} ${BUCKET_RANGE[b]}: <strong>${input.legend[b]}</strong></li>`);
  return html`<div class="bar" role="img" aria-label="${input.title}">${join(segments)}</div><ul class="legend">${join(legend)}</ul>`;
}
