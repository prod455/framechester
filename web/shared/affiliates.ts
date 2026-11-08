/** Affiliate links of a channel, edited as one line per link: `name | https://url | term, term`.
 * The engine lists a link only in the description of a video that says one of its terms. */
import type { AffiliateLink } from './types.ts';

export const maxAffiliates = 10;
export const maxAffiliateTerms = 10;

const singleLine = (value: string, min: number, max: number) =>
  value.trim().length >= min && value.trim().length <= max && !/\p{Cc}/u.test(value);

/** The same rule the Rust engine applies (`AffiliateLink::validate`). */
export function validAffiliate(link: AffiliateLink): boolean {
  return (
    singleLine(link.label, 1, 80) &&
    /^https:\/\/\S+$/.test(link.url) &&
    link.url.length <= 500 &&
    !/\p{Cc}/u.test(link.url) &&
    link.terms.length >= 1 &&
    link.terms.length <= maxAffiliateTerms &&
    link.terms.every((term) => singleLine(term, 2, 40))
  );
}

/** Parses the editor text. A malformed line is kept as an invalid link so the server names it. */
export function parseAffiliateLines(text: string): AffiliateLink[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length !== 3) return { label: line, url: '', terms: [] };
      const [label, url, terms] = parts as [string, string, string];
      return {
        label,
        url,
        terms: terms
          .split(',')
          .map((term) => term.trim())
          .filter(Boolean),
      };
    });
}

export function formatAffiliateLines(links: readonly AffiliateLink[] | undefined): string {
  return (links ?? []).map((link) => `${link.label} | ${link.url} | ${link.terms.join(', ')}`).join('\n');
}
