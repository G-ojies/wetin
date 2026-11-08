import { chat, parseJson, providerInfo, type CallMeta } from "./llm";

/**
 * When a question falls outside the statutes Wetin carries, it searches the web through Otari's gateway-run
 * search tool for where to get real help (an agency, a legal aid office, a hotline). Results are shown apart from
 * the grounded answer and labelled as unchecked against statute text. Wetin never cites the web as law.
 */
export type HelpLink = { title: string; url: string; why: string };

const SYSTEM = `You find where a person in Nigeria can get real help with a legal problem.
Use the web search tool. Prefer official sources: Nigerian government agencies (.gov.ng), the Legal Aid Council of Nigeria, the National Human Rights Commission, state Ministries of Justice, the Nigerian Bar Association, and established legal aid NGOs.
Never give legal advice and never quote law. Only list pages you actually found in the search results.
Return ONLY JSON: {"links":[{"title":"page or body name","url":"https://...","why":"one short sentence on how it helps"}]} with at most 3 links.`;

export async function findHelpOnline(problem: string, opts: { endUser?: string; meta?: CallMeta } = {}): Promise<{ links: HelpLink[]; source: string } | null> {
  if (providerInfo().provider !== "otari" || process.env.OTARI_WEB_SEARCH === "0") return null;
  try {
    const raw = await chat({ system: SYSTEM, user: `Problem: ${problem}`, tier: "smart", json: true, maxTokens: 700, tools: [{ type: "otari_web_search" }], endUser: opts.endUser, meta: opts.meta });
    const links = (parseJson<{ links: HelpLink[] }>(raw).links ?? [])
      .filter((l) => l && typeof l.url === "string" && /^https:\/\/[^\s]+$/.test(l.url) && l.title)
      .slice(0, 3);
    return links.length ? { links, source: "Web search through Otari. Not checked against statute text." } : null;
  } catch {
    return null;
  }
}
