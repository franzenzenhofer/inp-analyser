import { z } from 'zod';
import type { Candidate } from './types.js';

const TARGET_KINDS = ['button', 'link', 'input-text', 'select', 'checkbox', 'summary', 'role', 'listener'] as const;

const RectSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const FormSchema = z.object({ method: z.string(), hasPassword: z.boolean(), hasPayment: z.boolean(), isSubmit: z.boolean() });

const CandidateSchema = z.object({
  selector: z.string().min(1),
  label: z.string(),
  ariaLabel: z.string(),
  value: z.string(),
  title: z.string(),
  kind: z.enum(TARGET_KINDS),
  rect: RectSchema,
  aboveFold: z.boolean(),
  href: z.string().nullable(),
  linkTarget: z.string().nullable(),
  download: z.boolean(),
  form: FormSchema.nullable(),
  domSignature: z.string().min(1),
});

/** Validates what the page returned: the page is untrusted, a shape mismatch fails loud. */
export function parseCandidates(value: unknown): readonly Candidate[] {
  return z.array(CandidateSchema).parse(value);
}
