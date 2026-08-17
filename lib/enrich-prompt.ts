import { Creator } from './creators';
import { extractContact } from './extract';

export interface EnrichTarget {
  id: string;
  channelName: string;
  aboutText: string;
}

/** Keep prompts compact: the shared gateway caps the request body. */
const ABOUT_LIMIT = 320;
/** One call per 12 creators: the shared gateway caps the request body. */
export const MAX_TARGETS_PER_CALL = 12;

export function toTargets(creators: Creator[]): EnrichTarget[] {
  return creators.slice(0, MAX_TARGETS_PER_CALL).map((c) => ({
    id: c.id,
    channelName: c.channelName,
    aboutText: c.aboutText.slice(0, ABOUT_LIMIT),
  }));
}

const SOURCE_FIELDS = [
  'business_panel',
  'booking_panel',
  'management_note',
  'contact_line',
  'pinned_comment',
  'about_footer',
  'about_page',
  'link_in_bio',
  'bio',
];

export function buildPrompt(targets: EnrichTarget[]): string {
  const items = targets
    .map((t) => `${t.id} | ${t.channelName} | ${t.aboutText.replace(/\s+/g, ' ')}`)
    .join('\n');

  return [
    'You are a contact-enrichment step in a creator-scouting pipeline.',
    'Each line below is one creator: id | channel | scraped about-page text.',
    'The text is split into labelled fields like [BIO], [LINKS], [BUSINESS], [BOOKING], [MANAGEMENT], [CONTACT], [PINNED], [FOOTER], [ABOUT].',
    '',
    'For each creator, find the BUSINESS email address for sponsorship outreach.',
    'Rules:',
    '- Prefer a business/booking/management address over a personal or fan-mail one (e.g. a gmail for fan mail is NOT the answer).',
    '- De-obfuscate forms like "name (at) host (dot) tld", "name [at] host [dot] tld", "name AT host DOT tld".',
    '- If no business address is published anywhere in the text, return null for email.',
    `- "source" is the field the address came from, snake_case, one of: ${SOURCE_FIELDS.join(', ')}.`,
    '',
    'Reply with ONLY a JSON array, no prose, no code fence:',
    '[{"id":"c001","email":"a@b.tv","source":"business_panel"}]',
    '',
    items,
  ].join('\n');
}

export interface RawExtraction {
  email: string | null;
  sourceField: string | null;
}

/** Tolerant parse: models wrap JSON in prose or fences more often than not. */
export function parseEnrichResponse(
  text: string,
  targets: EnrichTarget[],
): Record<string, RawExtraction> {
  const out: Record<string, RawExtraction> = {};
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return out;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;

  const known = new Set(targets.map((t) => t.id));
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!known.has(id)) continue;
    const email = typeof item.email === 'string' && item.email.includes('@') ? item.email.trim().toLowerCase() : null;
    const source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : null;
    out[id] = { email, sourceField: email ? (source ?? 'about_page') : null };
  }
  return out;
}

/** Deterministic answer for the `mock` provider used by the test suite. */
export function mockEnrich(targets: EnrichTarget[]): Record<string, RawExtraction> {
  const out: Record<string, RawExtraction> = {};
  for (const target of targets) out[target.id] = extractContact(target.aboutText);
  return out;
}
