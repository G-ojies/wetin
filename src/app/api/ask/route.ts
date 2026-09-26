import { NextRequest } from "next/server";
import { searchSections, verifyQuote, getSection, STATUTES } from "@/lib/corpus";
import { chat, parseJson, providerInfo } from "@/lib/llm";
import { EXPAND_SYSTEM, answerSystem } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

type Expansion = { understood: string; queries: string[]; statutes: string[]; urgent?: boolean };
type Citation = { id: string; why: string; quote: string; verified?: boolean };
type Answer = { answer: string; steps: string[]; citations: Citation[]; confidence: "high" | "medium" | "low"; notInCorpus: boolean; letterType: string | null };

const enc = new TextEncoder();

export async function POST(req: NextRequest) {
  const { question, lang = "en" } = (await req.json()) as { question: string; lang?: "en" | "pcm" };
  if (!question || question.trim().length < 3) return new Response("Ask a question", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ type: "status", text: "Understanding your question" });
        let exp: Expansion;
        try {
          exp = parseJson<Expansion>(await chat({ system: EXPAND_SYSTEM, user: question, tier: "fast", json: true, maxTokens: 400 }));
        } catch {
          exp = { understood: question, queries: [question], statutes: [] };
        }
        const validKeys = new Set(STATUTES.map((s) => s.key));
        const statutes = (exp.statutes ?? []).filter((k) => validKeys.has(k));
        send({ type: "understood", text: exp.understood, queries: exp.queries, urgent: !!exp.urgent });

        // Retrieval: statute-restricted first, then widen so nothing important is missed.
        const queries = [question, ...(exp.queries ?? [])];
        let hits = searchSections(queries, { statutes, limit: 7 });
        const extra = searchSections(queries, { limit: 14 }).filter((h) => !hits.some((x) => x.section.id === h.section.id));
        hits = [...hits, ...extra].slice(0, 10);
        send({ type: "sections", sections: hits.map((h) => h.section) });
        send({ type: "status", text: `Reading ${hits.length} sections of the law` });

        const context = hits
          .map((h) => `### id: ${h.section.id}\n${h.section.statuteName}, section ${h.section.section}${h.section.title ? ` (${h.section.title})` : ""}\n${h.section.text.slice(0, 3200)}`)
          .join("\n\n");
        const user = `PERSON'S MESSAGE:\n${question}\n\nWHAT THEY ARE ASKING (restated):\n${exp.understood}\n\nSUPPLIED STATUTE SECTIONS:\n${context}`;
        const raw = await chat({ system: answerSystem(lang), user, tier: "smart", json: true, maxTokens: 2200 });
        const ans = parseJson<Answer>(raw);

        // Grounding checks: drop citations outside the retrieved set, verify quotes against statute text.
        const allowed = new Set(hits.map((h) => h.section.id));
        const seen = new Set<string>();
        const citations: Citation[] = (ans.citations ?? [])
          .filter((c) => c && allowed.has(c.id))
          .map((c) => ({ ...c, verified: verifyQuote(c.id, c.quote) }))
          .sort((a, b) => Number(b.verified) - Number(a.verified))
          .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
        // Strip inline tokens that point outside the retrieved set.
        const answerText = (ans.answer ?? "").replace(/\[\[([^\]]+)\]\]/g, (m, id) => (allowed.has(id) && getSection(id) ? m : ""));
        const verifiedCount = citations.filter((c) => c.verified).length;

        send({
          type: "answer",
          answer: answerText,
          steps: ans.steps ?? [],
          citations,
          confidence: ans.confidence ?? "medium",
          notInCorpus: !!ans.notInCorpus,
          letterType: ans.letterType ?? null,
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
