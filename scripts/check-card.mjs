// Fails if any rights-card quote is not verbatim statute text.
import fs from "node:fs";
const corpus = JSON.parse(fs.readFileSync(new URL("../src/data/corpus.json", import.meta.url)));
const byId = new Map(corpus.map((s) => [s.id, s]));
const src = fs.readFileSync(new URL("../src/data/rights-card.ts", import.meta.url), "utf8");
const norm = (t) => t.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[^a-z0-9()\s]/g, " ").replace(/\s+/g, " ").trim();
const items = [...src.matchAll(/sectionId:\s*"([^"]+)"[\s\S]*?quote:\s*"([^"]+)"/g)].map((m) => ({ sectionId: m[1], quote: m[2] }));
let bad = 0;
for (const it of items) {
  const s = byId.get(it.sectionId);
  const ok = !!s && norm(s.text).includes(norm(it.quote));
  console.log(ok ? "ok  " : "FAIL", it.sectionId, "|", it.quote.slice(0, 70));
  if (!ok) bad++;
}
console.log(`${items.length - bad}/${items.length} card quotes verified`);
process.exit(bad ? 1 : 0);
