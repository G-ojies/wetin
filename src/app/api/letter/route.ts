import { NextRequest } from "next/server";
import { getSection } from "@/lib/corpus";
import { chat } from "@/lib/llm";
import { LETTER_SYSTEM } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { question, answer, sectionIds, letterType } = (await req.json()) as { question: string; answer: string; sectionIds: string[]; letterType: string };
  const sections = (sectionIds ?? []).map(getSection).filter(Boolean);
  if (!sections.length) return Response.json({ error: "No cited sections" }, { status: 400 });
  const context = sections.map((s) => `### ${s!.statuteName}, section ${s!.section}${s!.title ? ` (${s!.title})` : ""}\n${s!.text.slice(0, 2500)}`).join("\n\n");
  const user = `DOCUMENT TO DRAFT: ${letterType}\n\nTHE PERSON'S SITUATION:\n${question}\n\nSUMMARY OF THEIR RIGHTS (already established):\n${answer.replace(/\[\[[^\]]+\]\]/g, "")}\n\nSTATUTE SECTIONS YOU MAY CITE:\n${context}`;
  try {
    const letter = await chat({ system: LETTER_SYSTEM, user, tier: "smart", maxTokens: 1200, temperature: 0.3 });
    return Response.json({ letter: letter.replace(/^```(?:markdown)?\s*|```$/g, "").trim() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
