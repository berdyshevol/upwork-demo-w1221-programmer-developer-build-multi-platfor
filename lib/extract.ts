/**
 * Deterministic contact extraction.
 *
 * This is the floor the pipeline stands on: it runs when there is no AI key and
 * no shared endpoint (FR12), and it is what the `mock` provider returns in
 * tests. The AI path does the same job on messier text — deobfuscation the
 * regexes below do not cover, and judging which of several addresses is the
 * business one.
 */

/** Section label in a scraped about blob -> the source field we report. */
const SECTION_SOURCE: Record<string, string> = {
  BUSINESS: 'business_panel',
  BOOKING: 'booking_panel',
  MANAGEMENT: 'management_note',
  CONTACT: 'contact_line',
  PINNED: 'pinned_comment',
  FOOTER: 'about_footer',
  ABOUT: 'about_page',
  LINKS: 'link_in_bio',
  BIO: 'bio',
};

/** Most business-like first. A fan-mail gmail in [BIO] must lose to [BOOKING]. */
const SECTION_PRIORITY = [
  'BUSINESS',
  'BOOKING',
  'MANAGEMENT',
  'CONTACT',
  'PINNED',
  'FOOTER',
  'ABOUT',
  'LINKS',
  'BIO',
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]{2,})+/;

/** `name (at) host (dot) tld`, `[at]`, `AT`/`DOT` -> a real address. */
function deobfuscate(text: string): string {
  return text
    .replace(/\s*[([{]\s*at\s*[)\]}]\s*/gi, '@')
    .replace(/\s*[([{]\s*dot\s*[)\]}]\s*/gi, '.')
    .replace(/\s+AT\s+/g, '@')
    .replace(/\s+DOT\s+/g, '.');
}

export interface AboutSection {
  label: string;
  text: string;
}

/** Split `[BIO] … [BUSINESS] …` into labelled sections. */
export function parseSections(aboutText: string): AboutSection[] {
  const out: AboutSection[] = [];
  const re = /\[([A-Z ]+)\]/g;
  let match: RegExpExecArray | null;
  const marks: { label: string; markerStart: number; textStart: number }[] = [];
  while ((match = re.exec(aboutText)) !== null) {
    marks.push({
      label: match[1].trim(),
      markerStart: match.index,
      textStart: match.index + match[0].length,
    });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1].markerStart : aboutText.length;
    out.push({
      label: marks[i].label,
      text: aboutText.slice(marks[i].textStart, end).trim(),
    });
  }
  if (out.length === 0) out.push({ label: 'ABOUT', text: aboutText });
  return out;
}

export interface Extraction {
  email: string | null;
  /** Which field of the scrape the address came from, e.g. `business_panel`. */
  sourceField: string | null;
}

/** Regex + section-priority extraction. Never throws. */
export function extractContact(aboutText: string): Extraction {
  const sections = parseSections(aboutText);
  const ranked = [...sections].sort((a, b) => {
    const ai = SECTION_PRIORITY.indexOf(a.label);
    const bi = SECTION_PRIORITY.indexOf(b.label);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const section of ranked) {
    const hit = EMAIL_RE.exec(deobfuscate(section.text));
    if (hit) {
      return {
        email: hit[0].toLowerCase().replace(/[.,;:]+$/, ''),
        sourceField: SECTION_SOURCE[section.label] ?? section.label.toLowerCase(),
      };
    }
  }
  return { email: null, sourceField: null };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}
