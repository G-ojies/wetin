import { chat, providerInfo, type CallMeta } from "./llm";

/**
 * The screen: Qwen3Guard (open weights) reads each question before the other models do.
 * People describe arrests, assaults and threats here, so only an attempt to hijack the assistant (Jailbreak) is
 * refused. Everything else is let through and the verdict is kept for the activity log. If the screen is down,
 * Wetin answers anyway: a person in a police cell should not lose the answer because a classifier timed out.
 */
export type Screen = { blocked: boolean; safety: string; categories: string[] };

export function parseGuard(raw: string): Screen {
  const safety = raw.match(/Safety:\s*(Safe|Unsafe|Controversial)/i)?.[1] ?? "Unknown";
  const categories = (raw.match(/Categories:\s*([^\n]+)/i)?.[1] ?? "").split(/,\s*/).map((c) => c.trim()).filter((c) => c && c !== "None");
  const blocked = /unsafe/i.test(safety) && categories.some((c) => /jailbreak/i.test(c));
  return { blocked, safety, categories };
}

export async function screenQuestion(question: string, opts: { endUser?: string; meta?: CallMeta } = {}): Promise<Screen> {
  if (providerInfo().provider !== "otari" && !process.env.LLM_GUARD_MODEL) return { blocked: false, safety: "Skipped", categories: [] };
  try {
    return parseGuard(await chat({ system: "", user: question, tier: "guard", maxTokens: 40, temperature: 0, endUser: opts.endUser, meta: opts.meta }));
  } catch {
    return { blocked: false, safety: "Unavailable", categories: [] };
  }
}
