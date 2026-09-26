import { spawn } from "node:child_process";

/**
 * Minimal provider-agnostic chat client.
 * Default: Vercel AI Gateway (OpenAI-compatible). Any OpenAI-compatible endpoint works:
 *   LLM_BASE_URL + LLM_API_KEY + LLM_MODEL / LLM_FAST_MODEL
 * Dev shim: LLM_PROVIDER=claude-cli uses the local `claude -p` binary (no key needed).
 */
export type Tier = "fast" | "smart";

const PRESETS: Record<string, { baseUrl: string; smart: string; fast: string; keyEnv: string }> = {
  gateway: { baseUrl: "https://ai-gateway.vercel.sh/v1", smart: "anthropic/claude-sonnet-4.5", fast: "anthropic/claude-haiku-4.5", keyEnv: "AI_GATEWAY_API_KEY" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", smart: "llama-3.3-70b-versatile", fast: "llama-3.1-8b-instant", keyEnv: "GROQ_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", smart: "gemini-2.5-flash", fast: "gemini-2.5-flash-lite", keyEnv: "GEMINI_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", smart: "anthropic/claude-sonnet-4.5", fast: "anthropic/claude-haiku-4.5", keyEnv: "OPENROUTER_API_KEY" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", smart: "claude-sonnet-4-5", fast: "claude-haiku-4-5", keyEnv: "ANTHROPIC_API_KEY" },
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
    smart: process.env.LLM_MODEL || p?.smart || "sonnet",
    fast: process.env.LLM_FAST_MODEL || p?.fast || "haiku",
  };
}

export async function chat(opts: { system: string; user: string; tier?: Tier; json?: boolean; maxTokens?: number; temperature?: number }): Promise<string> {
  const name = detectProvider();
  const info = providerInfo();
  const model = opts.tier === "fast" ? info.fast : info.smart;
  if (name === "claude-cli") return claudeCli(opts.system, opts.user, model);
  const p = PRESETS[name];
  const baseUrl = process.env.LLM_BASE_URL || p.baseUrl;
  const key = process.env.LLM_API_KEY || process.env[p.keyEnv];
  if (!key) throw new Error(`Missing API key: set ${p.keyEnv}`);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    max_tokens: opts.maxTokens ?? 1800,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json && name !== "anthropic") body.response_format = { type: "json_object" };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
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
