import { spawn } from "node:child_process";

/**
 * Minimal provider-agnostic chat client.
 * Default: Vercel AI Gateway (OpenAI-compatible). Any OpenAI-compatible endpoint works:
 *   LLM_BASE_URL + LLM_API_KEY + LLM_MODEL / LLM_FAST_MODEL
 * Dev shim: LLM_PROVIDER=claude-cli uses the local `claude -p` binary (no key needed).
 */
export type Tier = "fast" | "smart";

// Each tier is a fallback chain: the next model is tried on rate limits (429) or model errors.
const PRESETS: Record<string, { baseUrl: string; smart: string[]; fast: string[]; keyEnv: string }> = {
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

function modelChain(name: string, tier: Tier): string[] {
  const p = PRESETS[name];
  const override = tier === "fast" ? process.env.LLM_FAST_MODEL : process.env.LLM_MODEL;
  if (override) return [override, ...(p ? (tier === "fast" ? p.fast : p.smart) : [])].filter((m, i, a) => a.indexOf(m) === i);
  return p ? (tier === "fast" ? p.fast : p.smart) : ["sonnet"];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds a 429 asks us to wait, if stated. */
function retryAfterSeconds(msg: string): number | null {
  const m = msg.match(/try again in ([\d.]+)\s*(m?s)/i);
  if (!m) return null;
  return m[2].toLowerCase() === "ms" ? parseFloat(m[1]) / 1000 : parseFloat(m[1]);
}

export async function chat(opts: { system: string; user: string; tier?: Tier; json?: boolean; maxTokens?: number; temperature?: number; onStatus?: (t: string) => void }): Promise<string> {
  const name = detectProvider();
  const tier: Tier = opts.tier ?? "smart";
  if (name === "claude-cli") return claudeCli(opts.system, opts.user, tier === "fast" ? "haiku" : "sonnet");
  const p = PRESETS[name];
  const baseUrl = process.env.LLM_BASE_URL || p.baseUrl;
  const key = process.env.LLM_API_KEY || process.env[p.keyEnv];
  if (!key) throw new Error(`Missing API key: set ${p.keyEnv}`);
  const chain = modelChain(name, tier);
  let lastErr: Error | null = null;
  let minWait = Infinity;
  // Pass 1: walk the chain. Pass 2: wait for the shortest stated reset and walk it again.
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      if (!isFinite(minWait)) break;
      const wait = Math.min(30, Math.max(2, minWait + 0.5));
      opts.onStatus?.(`Busy right now, retrying in ${Math.ceil(wait)}s`);
      await sleep(wait * 1000);
    }
    for (const model of chain) {
      try {
        return await callOnce(baseUrl, key, name, model, opts);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastErr = err;
        if (/^LLM 429/.test(err.message)) {
          const s = retryAfterSeconds(err.message);
          if (s !== null) minWait = Math.min(minWait, s);
          continue;
        }
        if (/^LLM (400|404|500|502|503)/.test(err.message)) continue;
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("LLM: no model available");
}

async function callOnce(baseUrl: string, key: string, name: string, model: string, opts: { system: string; user: string; json?: boolean; maxTokens?: number; temperature?: number }): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    max_tokens: opts.maxTokens ?? 1800,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json && name !== "anthropic") body.response_format = { type: "json_object" };
  const post = async () => {
    try {
      return await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
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
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
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
