// Automatic source suggestions from Crossref, the DOI registry of peer-reviewed journals and
// conference proceedings (IEEE, Springer, Nature, SciELO, ...). Public API: no key, no cost,
// no credential, only api.crossref.org. A suggestion is a real paper the operator still has to
// read, so its license text says so and QA keeps treating it as pending review.
import type { Source } from '../shared/types.ts';

export interface SourceFinder {
  /** Up to `limit` distinct peer-reviewed works for the given queries, most cited first. Never throws. */
  suggest(queries: string[], limit?: number): Promise<Source[]>;
}
export interface SourceFinderOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}
interface Work {
  doi: string;
  title: string;
  venue: string;
  publisher: string;
  year: number | undefined;
  citations: number;
}

const endpoint = 'https://api.crossref.org/works';
const userAgent = 'Framechester/0.1 (local Studio; https://github.com/prod455/framechester)';
const maxBody = 1_048_576;
const timeoutMs = 10_000;
/** Works cited fewer times than this are not suggested at all: an obscure paper is not a source. */
const establishedCitations = 10;
const stopWords = new Set(
  'como para porque sobre entre quando onde qual quais este esta esse essa isso aquilo mais menos muito pouco todo toda todos todas seus suas nosso nossa dela dele delas deles pelo pela pelos pelas numa numa with from that this these those into than then they them their there what when where which while about after before being have been were will would could should'.split(
    ' ',
  ),
);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
/** Significant query terms: four or more letters, no stop words. */
export function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).match(/[\p{L}\p{N}]{4,}/gu) ?? [])].filter(
    (term) => !stopWords.has(term),
  );
}
/** A work is on topic when enough query terms appear in its title or venue. */
export function onTopic(query: string, work: Pick<Work, 'title' | 'venue'>): boolean {
  const terms = queryTerms(query);
  if (!terms.length) return false;
  const text = normalize(`${work.title} ${work.venue}`);
  // One shared word (often a verb such as "tinha") is coincidence; demand half of the terms,
  // and at least two of them whenever the query has two or more.
  const matched = terms.filter((term) => text.includes(term)).length;
  return matched >= Math.max(Math.min(terms.length, 2), Math.ceil(terms.length / 2));
}

export function suggestedLicense(work: Pick<Work, 'year'>): string {
  return `Artigo revisado por pares (DOI)${work.year ? ` · ${work.year}` : ''} · sugerido automaticamente via Crossref; conferir antes de publicar`;
}

function cleanQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function first(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value;
  if (typeof item !== 'string') return '';
  // Crossref metadata sometimes carries HTML entities ("GIScience &amp; Remote Sensing").
  return item
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name: string) => entities[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWorks(payload: unknown): Work[] {
  const message =
    payload && typeof payload === 'object' && 'message' in payload
      ? (payload.message as { items?: unknown })
      : undefined;
  if (!message || !Array.isArray(message.items)) return [];
  const works: Work[] = [];
  for (const row of message.items) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const doi = typeof item.DOI === 'string' ? item.DOI.trim() : '';
    const title = first(item.title).slice(0, 300);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi) || !title) continue;
    const issued = item.issued as { 'date-parts'?: unknown } | undefined;
    const parts = Array.isArray(issued?.['date-parts']) ? issued['date-parts'][0] : undefined;
    const year = Array.isArray(parts) && Number.isInteger(parts[0]) ? (parts[0] as number) : undefined;
    const citations = typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : 0;
    works.push({
      doi,
      title,
      venue: first(item['container-title']).slice(0, 200),
      publisher: typeof item.publisher === 'string' ? item.publisher.trim().slice(0, 100) : '',
      year,
      citations,
    });
  }
  return works;
}

export function createSourceFinder(options: SourceFinderOptions = {}): SourceFinder {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  async function search(query: string, rows: number): Promise<Work[]> {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      'query.bibliographic': query,
      filter: 'type:journal-article,type:proceedings-article',
      rows: String(rows),
      select: 'DOI,title,container-title,publisher,issued,is-referenced-by-count',
    }).toString();
    const response = await fetcher(url.toString(), {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return [];
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maxBody) {
          await reader.cancel();
          return [];
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    return parseWorks(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }
  return {
    async suggest(queries, limit = 3) {
      const wanted = [...new Set(queries.map(cleanQuery).filter((query) => query.length >= 3))].slice(0, 4);
      const retrievedAt = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
      const found = new Map<string, Source>();
      for (const query of wanted) {
        if (found.size >= limit) break;
        let works: Work[] = [];
        try {
          works = await search(query, 8);
        } catch {
          continue;
        }
        // Crossref orders by relevance; keep only established work that is visibly on topic.
        const ranked = works
          .filter((work) => work.citations >= establishedCitations && onTopic(query, work))
          .sort((a, b) => b.citations - a.citations);
        for (const work of ranked.slice(0, 2)) {
          const key = work.doi.toLowerCase();
          if (found.has(key) || found.size >= limit) continue;
          found.set(key, {
            title: work.title,
            url: `https://doi.org/${work.doi}`,
            publisher: [work.venue, work.publisher].filter(Boolean).join(' · ').slice(0, 300) || 'Crossref',
            retrievedAt,
            license: suggestedLicense(work),
          });
        }
      }
      return [...found.values()];
    },
  };
}
