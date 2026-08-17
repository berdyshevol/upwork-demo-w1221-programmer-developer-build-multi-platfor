import { cookies } from 'next/headers';
import { blocklistSeed } from './creators';

/**
 * The blocklist is the one thing the visitor writes, so per `.claude/adr/0001`
 * it rides in a cookie — not a module-level array. Two requests to this demo are
 * two processes; a `let` here would make the operator's edit vanish on reload,
 * intermittently.
 *
 * The cookie holds only the delta (what this operator added and removed). The
 * seeded domains stay in code.
 */
export const BLOCKLIST_COOKIE = 'sp_blocklist';

export interface BlocklistDelta {
  add: string[];
  remove: string[];
}

const EMPTY: BlocklistDelta = { add: [], remove: [] };

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** `https://Rising Talent.GG/x` -> `risingtalent.gg`; invalid input -> null. */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '');
  value = value.replace(/^.*@/, '');
  value = value.split(/[/?#]/)[0];
  value = value.replace(/\.$/, '').replace(/\s+/g, '');
  if (!value || value.length > 253) return null;
  return DOMAIN_RE.test(value) ? value : null;
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const domain = normalizeDomain(item);
    if (domain && !out.includes(domain)) out.push(domain);
  }
  return out.slice(0, 60);
}

/** Never throws on a tampered or truncated cookie. */
export async function readBlocklistDelta(): Promise<BlocklistDelta> {
  const raw = (await cookies()).get(BLOCKLIST_COOKIE)?.value;
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<BlocklistDelta>;
    return { add: sanitizeList(parsed.add), remove: sanitizeList(parsed.remove) };
  } catch {
    return EMPTY;
  }
}

export function applyDelta(delta: BlocklistDelta): string[] {
  const removed = new Set(delta.remove);
  const base = blocklistSeed.filter((d) => !removed.has(d));
  for (const domain of delta.add) {
    if (!base.includes(domain)) base.push(domain);
  }
  return base;
}

export async function readBlocklist(): Promise<string[]> {
  return applyDelta(await readBlocklistDelta());
}

/** Only callable from a server action or route handler. */
export async function writeBlocklistDelta(delta: BlocklistDelta): Promise<void> {
  (await cookies()).set(BLOCKLIST_COOKIE, encodeURIComponent(JSON.stringify(delta)), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** True for domains that came with the demo rather than from this operator. */
export function isSeeded(domain: string): boolean {
  return blocklistSeed.includes(domain);
}
