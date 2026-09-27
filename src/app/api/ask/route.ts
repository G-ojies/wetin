import { NextRequest } from "next/server";
import { searchSections, verifyQuote, snapQuote, getSection, STATUTES } from "@/lib/corpus";
import { chat, parseJson, providerInfo } from "@/lib/llm";
import { EXPAND_SYSTEM, RERANK_SYSTEM, answerSystem } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

type Expansion = { understood: string; queries: string[]; statutes: string[]; urgent?: boolean };
type Citation = { id: string; why: string; quote: string; verified?: boolean; snapped?: boolean };
type Answer = { answer: string; steps: string[]; citations: Citation[]; confidence: "high" | "medium" | "low"; notInCorpus: boolean; letterType: string | null };

const enc = new TextEncoder();

const DEFAULT_LETTER: Record<string, string> = {
  "tenancy-lagos": "Letter to landlord asserting tenant's rights",
  "labour-act": "Letter to employer asserting employee's rights",
  ndpa: "Complaint to the Nigeria Data Protection Commission",
  "police-act": "Formal complaint to the Divisional Police Officer",
  acja: "Formal complaint to the Divisional Police Officer",
  cybercrimes: "Formal complaint to the police about an online offence",
  "child-rights": "Formal complaint asserting the child's rights",
  constitution: "Formal complaint asserting fundamental rights",
};

/** The model usually names the document; if it does not, pick one from the statute most cited. */
function letterTypeFor(ans: Answer, citations: Citation[]): string | null {
  if (ans.letterType && ans.letterType !== "null") return ans.letterType;
  if (ans.notInCorpus || !citations.length) return null;
  const counts = new Map<string, number>();
  for (const c of citations) { const k = c.id.split(":")[0]; if (k !== "constitution") counts.set(k, (counts.get(k) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "constitution";
  return DEFAULT_LETTER[top] ?? null;
}

export async function POST(req: NextRequest) {
  const { question, lang = "en" } = (await req.json()) as { question: string; lang?: "en" | "pcm" };
  if (!question || question.trim().length < 3) return new Response("Ask a question", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      // Demo replay: serve a recorded transcript with realistic pacing (never set in production).
      if (process.env.WETIN_REPLAY_DIR) {
        try {
          const fs = await import("node:fs/promises");
          const raw = await fs.readFile(`${process.env.WETIN_REPLAY_DIR}/ask-${lang}.ndjson`, "utf8");
          for (const line of raw.split("\n").filter(Boolean)) {
            const ev = JSON.parse(line);
            await new Promise((r) => setTimeout(r, ev.type === "answer" ? 3500 : ev.type === "understood" ? 1800 : 400));
            send(ev);
          }
        } catch (e) {
          send({ type: "error", message: String(e) });
        } finally { controller.close(); }
        return;
      }
      try {
        send({ type: "status", text: "Understanding your question" });
        let exp: Expansion;
        try {
          exp = parseJson<Expansion>(await chat({ system: EXPAND_SYSTEM, user: question, tier: "fast", json: true, maxTokens: 500 }));
        } catch {
          exp = { understood: question, queries: [question], statutes: [] };
        }
        const validKeys = new Set(STATUTES.map((s) => s.key));
        const chosen = (exp.statutes ?? []).filter((k) => validKeys.has(k));
        const statutes = chosen.length ? Array.from(new Set([...chosen, "constitution"])) : [];
        send({ type: "understood", text: exp.understood, queries: exp.queries, urgent: !!exp.urgent });

        // Retrieval: statute-restricted first, then widen so nothing important is missed.
        const queries = [question, ...(exp.queries ?? [])];
        let hits = statutes.length ? searchSections(queries, { statutes, limit: 14 }) : [];
        const extra = searchSections(queries, { limit: 30 }).filter((h) => !hits.some((x) => x.section.id === h.section.id));
        hits = [...hits, ...extra].slice(0, 24);
        // Rerank the lexical candidates with the fast model; fall back to BM25 order.
        send({ type: "status", text: `Choosing the most relevant of ${hits.length} sections` });
        try {
          const list = hits.map((h, i) => `${i + 1}. id=${h.section.id} | ${h.section.statuteShort} s.${h.section.section}${h.section.title ? ` (${h.section.title})` : ""} | ${h.section.text.slice(0, 220).replace(/\s+/g, " ")}`).join("\n");
          const rr = parseJson<{ ids: string[] }>(await chat({ system: RERANK_SYSTEM, user: `QUESTION: ${question}\nRESTATED: ${exp.understood}\n\nCANDIDATES:\n${list}`, tier: "fast", json: true, maxTokens: 300 }));
          const byId = new Map(hits.map((h) => [h.section.id, h]));
          const picked = (rr.ids ?? []).map((id) => byId.get(id)).filter((h): h is NonNullable<typeof h> => !!h);
          if (picked.length >= 4) hits = [...picked, ...hits.filter((h) => !picked.includes(h))].slice(0, Math.max(7, Math.min(picked.length, 8)));
          else hits = hits.slice(0, 8);
        } catch {
          hits = hits.slice(0, 8);
        }
        send({ type: "sections", sections: hits.map((h) => h.section) });
        send({ type: "status", text: `Reading ${hits.length} sections of the law` });

        const context = hits
          .map((h) => `### id: ${h.section.id}\n${h.section.statuteName}, section ${h.section.section}${h.section.title ? ` (${h.section.title})` : ""}\n${h.section.text.slice(0, 1600)}`)
          .join("\n\n");
        const langLine = lang === "pcm" ? "ANSWER LANGUAGE: Nigerian Pidgin. The \"answer\" and every item in \"steps\" MUST be written in Nigerian Pidgin (BBC Pidgin style), not standard English. Only the statutory quotes stay in English." : "ANSWER LANGUAGE: plain English.";
        const user = `${langLine}\n\nPERSON'S MESSAGE:\n${question}\n\nWHAT THEY ARE ASKING (restated):\n${exp.understood}\n\nSUPPLIED STATUTE SECTIONS:\n${context}\n\n${langLine}`;
        let ans: Answer;
        try {
          ans = parseJson<Answer>(await chat({ system: answerSystem(lang), user, tier: "smart", json: true, maxTokens: 1600, onStatus: (t) => send({ type: "status", text: t }) }));
        } catch {
          send({ type: "status", text: "Double-checking the answer" });
          ans = parseJson<Answer>(await chat({ system: answerSystem(lang), user: user + "\n\nReturn ONLY the JSON object, nothing else.", tier: "smart", json: true, maxTokens: 1600, onStatus: (t) => send({ type: "status", text: t }) }));
        }

        // Grounding checks: drop citations outside the retrieved set, verify quotes against statute text.
        const allowed = new Set(hits.map((h) => h.section.id));
        const seen = new Set<string>();
        const citations: Citation[] = (ans.citations ?? [])
          .filter((c) => c && allowed.has(c.id))
          .map((c) => {
            if (verifyQuote(c.id, c.quote)) return { ...c, verified: true };
            const snapped = snapQuote(c.id, c.quote);
            return snapped ? { ...c, quote: snapped, verified: true, snapped: true } : { ...c, verified: false };
          })
          .sort((a, b) => Number(b.verified) - Number(a.verified))
          .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
        // Strip inline tokens that point outside the retrieved set.
        let answerText = (ans.answer ?? "").replace(/\[\[([^\]]+)\]\]/g, (m, id) => (allowed.has(id) && getSection(id) ? m : ""));
        if (!/\[\[[^\]]+\]\]/.test(answerText)) {
          const byNumber = new Map<number, string[]>();
          for (const h of hits) byNumber.set(h.section.section, [...(byNumber.get(h.section.section) ?? []), h.section.id]);
          answerText = answerText.replace(/\b[Ss]ections?\s+(\d{1,3})(?:\s*\(\d+\))?(\s+of\s+the\s+[A-Z][A-Za-z ]{3,40}?(?:Act|Law|Constitution)(?:\s+\d{4})?)?/g, (m, num, of) => {
            const ids = byNumber.get(Number(num)) ?? [];
            let id = ids.length === 1 ? ids[0] : undefined;
            if (!id && of) id = ids.find((x) => of.toLowerCase().includes(getSection(x)!.statuteShort.toLowerCase().split(" ")[0]));
            return id ? `${m} [[${id}]]` : m;
          });
        }
        const verifiedCount = citations.filter((c) => c.verified).length;

        send({
          type: "answer",
          answer: answerText,
          steps: ans.steps ?? [],
          citations,
          confidence: ans.confidence ?? "medium",
          notInCorpus: !!ans.notInCorpus,
          letterType: letterTypeFor(ans, citations),
          grounding: { cited: citations.length, verified: verifiedCount },
          provider: providerInfo(),
        });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
