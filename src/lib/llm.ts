import { spawn } from "node:child_process";

/**
 * Minimal provider-agnostic chat client.
 * Default: Vercel AI Gateway (OpenAI-compatible). Any OpenAI-compatible endpoint works:
 *   LLM_BASE_URL + LLM_API_KEY + LLM_MODEL / LLM_FAST_MODEL
 * Dev shim: LLM_PROVIDER=claude-cli uses the local `claude -p` binary (no key needed).
 */
export type Tier = "fast" | "smart" | "draft" | "guard";

/** Who is asking, so the gateway can meter and cap each visitor on their own budget (Otari end users). */
export type CallMeta = { model?: string; requested?: string; provider?: string };

// Each tier is a fallback chain: the next model is tried on rate limits (429) or model errors.
type Preset = { baseUrl: string; smart: string[]; fast: string[]; draft?: string[]; guard?: string[]; keyEnv: string };
const PRESETS: Record<string, Preset> = {
  // Otari (Mozilla AI's open-source gateway). Each tier is a routing policy defined in the Otari dashboard
  // (wetin-fast, wetin-answer, wetin-letter), with the same open-weight models as direct fallbacks in case a
  // policy is missing. Policies do the failover inside the gateway; the chain here is only a second line.
  otari: {
    baseUrl: "https://otari.ai/api/v1",
    fast: ["wetin-fast", "alibaba/qwen3-30b-a3b-instruct-2507", "google/gemma-3-27b-it"],
    smart: ["wetin-answer", "alibaba/qwen3-235b-a22b-instruct-2507", "deepseek/deepseek-v4-flash"],
    draft: ["wetin-letter", "meta/llama-3.3-70b-instruct", "alibaba/qwen3-235b-a22b-instruct-2507"],
    guard: ["alibaba/qwen3guard-gen-8b"],
    keyEnv: "OTARI_API_KEY",
  },
  groq: { baseUrl: "https://api.groq.com/openai/v1", smart: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"], fast: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"], keyEnv: "GROQ_API_KEY" },
  gateway: { baseUrl: "https://ai-gateway.vercel.sh/v1", smart: ["anthropic/claude-sonnet-4.5"], fast: ["anthropic/claude-haiku-4.5"], keyEnv: "AI_GATEWAY_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", smart: ["gemini-2.5-flash"], fast: ["gemini-2.5-flash-lite"], keyEnv: "GEMINI_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", smart: ["anthropic/claude-sonnet-4.5"], fast: ["anthropic/claude-haiku-4.5"], keyEnv: "OPENROUTER_API_KEY" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", smart: ["claude-sonnet-4-5"], fast: ["claude-haiku-4-5"], keyEnv: "ANTHROPIC_API_KEY" },
};

function detectProvider(): string {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER;
  for (const [name, p] of Object.entries(PRESETS)) if (process.env[p.keyEnv]) return name;
  return "claude-cli";
}

export function providerInfo() {
  const name = detectProvider();
  const p = PRESETS[name];
  return {
    provider: name,
    smart: process.env.LLM_MODEL || p?.smart[0] || "sonnet",
    fast: process.env.LLM_FAST_MODEL || p?.fast[0] || "haiku",
  };
}

function tierModels(p: Preset | undefined, tier: Tier): string[] {
  if (!p) return [];
  if (tier === "draft") return p.draft ?? p.smart;
  if (tier === "guard") return p.guard ?? [];
  return tier === "fast" ? p.fast : p.smart;
}

function modelChain(name: string, tier: Tier): string[] {
  const p = PRESETS[name];
  const override = { fast: process.env.LLM_FAST_MODEL, smart: process.env.LLM_MODEL, draft: process.env.LLM_DRAFT_MODEL, guard: process.env.LLM_GUARD_MODEL }[tier];
  const base = tierModels(p, tier);
  if (override) return [override, ...base].filter((m, i, a) => a.indexOf(m) === i);
  return base.length ? base : ["sonnet"];
}

/** A refusal that retrying another model will not fix: a guardrail block, or this visitor's budget is spent. */
export class GatewayRefusal extends Error {
  constructor(public kind: "guardrail" | "budget", message: string) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds a 429 asks us to wait, if stated. */
function retryAfterSeconds(msg: string): number | null {
  const m = msg.match(/try again in ([\d.]+)\s*(m?s)/i);
  if (!m) return null;
  return m[2].toLowerCase() === "ms" ? parseFloat(m[1]) / 1000 : parseFloat(m[1]);
}

export type ChatOpts = {
  system: string;
  user: string;
  tier?: Tier;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  onStatus?: (t: string) => void;
  /** Anonymous visitor id. On Otari it names the end user, so each visitor spends from their own budget. */
  endUser?: string;
  /** Gateway-run tools, e.g. [{ type: "otari_web_search" }]. Otari only. */
  tools?: unknown[];
  /** Filled in with the model that actually answered. */
  meta?: CallMeta;
};

export async function chat(opts: ChatOpts): Promise<string> {
  const name = detectProvider();
  const tier: Tier = opts.tier ?? "smart";
  if (name === "claude-cli") {
    if (tier === "guard") return "Safety: Safe";
    return claudeCli(opts.system, opts.user, tier === "fast" ? "haiku" : "sonnet");
  }
  const p = PRESETS[name];
  const baseUrl = process.env.LLM_BASE_URL || p.baseUrl;
  const key = process.env.LLM_API_KEY || process.env[p.keyEnv];
  if (!key) throw new Error(`Missing API key: set ${p.keyEnv}`);
  const chain = modelChain(name, tier);
  let lastErr: Error | null = null;
  let minWait = Infinity;
  let maxWait = 0;
  // Pass 1: walk the chain. Pass 2: wait for the shortest stated reset. Pass 3: wait for the longest.
  for (let pass = 0; pass < 3; pass++) {
    if (pass > 0) {
      if (!isFinite(minWait)) break;
      const wait = Math.min(40, Math.max(2, (pass === 1 ? minWait : maxWait) + 0.5));
      opts.onStatus?.(`Many people are asking right now, retrying in ${Math.ceil(wait)}s`);
      await sleep(wait * 1000);
      minWait = Infinity; maxWait = 0;
    }
    for (const model of chain) {
      try {
        return await callOnce(baseUrl, key, name, model, opts);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastErr = err;
        if (/^LLM 429/.test(err.message)) {
          const s = retryAfterSeconds(err.message);
          if (s !== null) { minWait = Math.min(minWait, s); maxWait = Math.max(maxWait, s); }
          else { minWait = Math.min(minWait, 10); maxWait = Math.max(maxWait, 20); }
          continue;
        }
        if (err instanceof GatewayRefusal) throw err;
        if (/^LLM (400|404|424|500|502|503)/.test(err.message)) continue;
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("LLM: no model available");
}

/** Guardrail profiles to run on every Otari request, from OTARI_GUARDRAILS="prompt-injection:block,pii:monitor". */
function guardrailsFromEnv(): { profile: string; mode: string; on_unavailable: string }[] | undefined {
  const raw = process.env.OTARI_GUARDRAILS?.trim();
  if (!raw) return undefined;
  return raw.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [profile, mode = "block"] = x.split(":");
    return { profile, mode, on_unavailable: "allow" };
  });
}

async function callOnce(baseUrl: string, key: string, name: string, model: string, opts: ChatOpts): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: opts.tier === "guard" ? [{ role: "user", content: opts.user }] : [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    max_tokens: opts.maxTokens ?? 1800,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json && name !== "anthropic") body.response_format = { type: "json_object" };
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${key}` };
  if (name === "otari") {
    headers["Otari-Key"] = key;
    if (opts.endUser) body.user = opts.endUser;
    if (opts.tools?.length) body.tools = opts.tools;
    const g = opts.tier === "guard" ? undefined : guardrailsFromEnv();
    if (g) body.guardrails = g;
  }
  const post = async () => {
    try {
      return await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.tools?.length ? 90000 : 45000) });
    } catch (e) {
      // Network failures and timeouts are retryable through the model chain.
      throw new Error(`LLM 503: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  let res = await post();
  if (res.status === 400 && body.response_format) {
    // Some models reject JSON mode; the prompts already demand JSON, so retry without it.
    delete body.response_format;
    res = await post();
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    if (name === "otari") {
      if (/guardrail_violation/.test(text)) throw new GatewayRefusal("guardrail", text);
      if (res.status === 402 || /budget|insufficient_funds|spend.?limit|ceiling/i.test(text)) throw new GatewayRefusal("budget", text);
    }
    throw new Error(`LLM ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (opts.meta) { opts.meta.requested = model; opts.meta.model = data.model ?? model; opts.meta.provider = name; }
  return data.choices?.[0]?.message?.content ?? "";
}

function claudeCli(system: string, user: string, model: string): Promise<string> {
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", user, "--system-prompt", system, "--model", model, "--output-format", "text"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("claude-cli: timeout")); }, 180000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(`claude-cli: ${err || `exit ${code}`}`)); else resolve(out.trim()); });
  });
}

/** Extract the first JSON object from a model reply (tolerates ```json fences and prose). */
export function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : raw;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON in model reply");
  return JSON.parse(s.slice(start, end + 1)) as T;
}
