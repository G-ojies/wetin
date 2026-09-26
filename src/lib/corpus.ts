import MiniSearch from "minisearch";
import corpusJson from "@/data/corpus.json";

export type Section = {
  id: string;            // e.g. "police-act:35"
  statute: string;       // key
  statuteShort: string;  // "Police Act 2020"
  statuteName: string;
  jurisdiction: string;
  section: number;
  title: string;
  text: string;
  url: string;
};

type Chunk = {
  id: string;        // sectionId#k
  sectionId: string;
  statute: string;
  statuteShort: string;
  title: string;
  text: string;
};

export const SECTIONS: Section[] = corpusJson as Section[];
const BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

export function getSection(id: string): Section | undefined {
  return BY_ID.get(id);
}

export const STATUTES = Array.from(
  SECTIONS.reduce((m, s) => {
    if (!m.has(s.statute)) m.set(s.statute, { key: s.statute, short: s.statuteShort, name: s.statuteName, jurisdiction: s.jurisdiction, url: s.url, count: 0 });
    m.get(s.statute)!.count++;
    return m;
  }, new Map<string, { key: string; short: string; name: string; jurisdiction: string; url: string; count: number }>()).values()
);

// Split long sections into subsection-sized chunks for retrieval; citations stay at section level.
function chunkSection(s: Section): Chunk[] {
  const base = { sectionId: s.id, statute: s.statute, statuteShort: s.statuteShort, title: s.title };
  if (s.text.length <= 1400) return [{ id: `${s.id}#0`, ...base, text: s.text }];
  const parts = s.text.split(/\n(?=\(\d{1,2}\) )/);
  const chunks: Chunk[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > 1400 && buf) {
      chunks.push({ id: `${s.id}#${chunks.length}`, ...base, text: buf.trim() });
      buf = "";
    }
    buf += (buf ? "\n" : "") + p;
  }
  if (buf.trim()) chunks.push({ id: `${s.id}#${chunks.length}`, ...base, text: buf.trim() });
  return chunks;
}

// Definition/citation sections match every query lexically; keep them readable but out of retrieval.
const NON_RETRIEVABLE = /^(interpretation|citation|short title|definitions?)$/i;
const CHUNKS: Chunk[] = SECTIONS.filter((s) => !NON_RETRIEVABLE.test(s.title.trim())).flatMap(chunkSection);
const CHUNK_BY_ID = new Map(CHUNKS.map((c) => [c.id, c]));

let index: MiniSearch<Chunk> | null = null;
function getIndex() {
  if (index) return index;
  index = new MiniSearch<Chunk>({
    fields: ["text", "title", "statuteShort"],
    storeFields: ["sectionId", "statute", "statuteShort", "title"],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15, combineWith: "OR" },
  });
  index.addAll(CHUNKS);
  return index;
}

export type Hit = { section: Section; score: number; snippet: string };

/**
 * Lexical retrieval over statute chunks. Returns the best sections (deduped),
 * optionally restricted to a set of statute keys.
 */
export function searchSections(queries: string[], opts: { statutes?: string[]; limit?: number } = {}): Hit[] {
  const idx = getIndex();
  const limit = opts.limit ?? 8;
  const agg = new Map<string, { score: number; snippet: string }>();
  for (const q of queries) {
    if (!q?.trim()) continue;
    const results = idx.search(q, {
      filter: opts.statutes?.length ? (r) => opts.statutes!.includes(r.statute) : undefined,
    });
    for (const r of results.slice(0, 40)) {
      const prev = agg.get(r.sectionId);
      const chunk = CHUNK_BY_ID.get(r.id)!;
      if (!prev || r.score > prev.score) agg.set(r.sectionId, { score: (prev?.score ?? 0) + r.score, snippet: chunk.text.slice(0, 300) });
      else prev.score += r.score * 0.3;
    }
  }
  return Array.from(agg.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id, v]) => ({ section: BY_ID.get(id)!, score: v.score, snippet: v.snippet }));
}

/** Normalise text for quote verification: collapse whitespace, strip quotes/dashes, lowercase. */
export function normalise(t: string) {
  return t.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[–—-]/g, " ").replace(/[^a-z0-9()\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Check that a quote appears verbatim (modulo whitespace/punctuation) in the section text. */
export function verifyQuote(sectionId: string, quote: string): boolean {
  const s = BY_ID.get(sectionId);
  if (!s || !quote) return false;
  const q = normalise(quote);
  if (q.length < 12) return false;
  return normalise(s.text).includes(q);
}
