import { NextRequest } from "next/server";
import { getSection } from "@/lib/corpus";
import { chat, GatewayRefusal, type CallMeta } from "@/lib/llm";
import { visitorId, withVisitorCookie } from "@/lib/visitor";
import { LETTER_SYSTEM } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { question, answer, sectionIds, letterType } = (await req.json()) as { question: string; answer: string; sectionIds: string[]; letterType: string };
  if (process.env.WETIN_REPLAY_DIR) {
    const fs = await import("node:fs/promises");
    await new Promise((r) => setTimeout(r, 3000));
    return new Response(await fs.readFile(`${process.env.WETIN_REPLAY_DIR}/letter-en.json`, "utf8"), { headers: { "content-type": "application/json" } });
  }
  const visitor = visitorId(req);
  const sections = (sectionIds ?? []).slice(0, 6).map(getSection).filter(Boolean);
  if (!sections.length) return Response.json({ error: "No cited sections" }, { status: 400 });
  const context = sections.map((s) => `### ${s!.statuteName}, section ${s!.section}${s!.title ? ` (${s!.title})` : ""}\n${s!.text.slice(0, 1500)}`).join("\n\n");
  const user = `DOCUMENT TO DRAFT: ${letterType}\n\nTHE PERSON'S SITUATION:\n${question}\n\nSUMMARY OF THEIR RIGHTS (already established):\n${answer.replace(/\[\[[^\]]+\]\]/g, "")}\n\nSTATUTE SECTIONS YOU MAY CITE:\n${context}`;
  try {
    // Role 4, the drafter: a different open-weight model writes the letter (Otari policy wetin-letter).
    const meta: CallMeta = {};
    const letter = await chat({ system: LETTER_SYSTEM, user, tier: "draft", maxTokens: 1000, temperature: 0.3, endUser: visitor.id, meta });
    return withVisitorCookie(Response.json({ letter: letter.replace(/^```(?:markdown)?\s*|```$/g, "").trim(), served: meta }), visitor);
  } catch (e) {
    if (e instanceof GatewayRefusal && e.kind === "budget") return Response.json({ error: "You have used today's free questions. Try again tomorrow." }, { status: 429 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
