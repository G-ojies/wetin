"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, BookOpenText, Check, ChevronDown, Copy, FileText, Languages, Moon, ShieldCheck, ShieldAlert, Sun, Sparkles, ExternalLink, AlertTriangle, LifeBuoy } from "lucide-react";

type Section = { id: string; statute: string; statuteShort: string; statuteName: string; jurisdiction: string; section: number; title: string; text: string; url: string };
type Citation = { id: string; why: string; quote: string; verified?: boolean };
type Answer = { answer: string; steps: string[]; citations: Citation[]; confidence: "high" | "medium" | "low"; notInCorpus: boolean; letterType: string | null; grounding: { cited: number; verified: number }; provider?: { provider: string; smart: string } };
type Lang = "en" | "pcm";

const T = {
  en: {
    tagline: "Know your rights under Nigerian law.",
    sub: "Tell Wetin what happened. You get a plain answer built only from the actual sections of Nigerian law, with every quote checked against the statute text.",
    placeholder: "What happened? For example: my landlord gave me 7 days to pack out…",
    ask: "Ask",
    examples: [
      "Police stopped me on the road and want to search my phone",
      "My landlord gave me 7 days to pack out of my flat in Lagos",
      "My employer has not paid my salary for two months",
      "A loan app is threatening to message all my contacts",
      "My brother was arrested yesterday and they refuse to grant bail",
    ],
    understood: "What you are asking",
    reading: "Sections being read",
    answer: "What the law says",
    steps: "What you can do now",
    cited: "Sections cited",
    alsoRead: "Also read, not cited",
    verified: "verified in statute text",
    unverified: "quote not found verbatim",
    draft: "Draft this document",
    drafting: "Drafting…",
    copy: "Copy",
    copied: "Copied",
    print: "Print",
    disclaimer: "Wetin is a guide, not a lawyer. It explains what the written law says. For your specific case, contact one of the free legal help services below.",
    notCovered: "The statutes Wetin currently holds do not clearly cover this. The answer below is limited to what they do say.",
    urgent: "Someone is being held right now?",
    urgentBody: "Under section 35 of the Constitution, a person arrested must be brought before a court within 24 hours where a court is within 40 km, otherwise within 48 hours. Ask for the name of the station and the officer, and call a lawyer or the Legal Aid Council.",
    help: "Free legal help",
    how: "How Wetin checks itself",
    how1: "Finds the sections",
    how1b: "Your question is turned into legal search terms and matched against 1,139 sections of six Nigerian statutes.",
    how2: "Answers only from them",
    how2b: "The model may only cite the sections it was shown. Any citation outside that set is dropped before you see it.",
    how3: "Verifies every quote",
    how3b: "Each quoted excerpt is string-matched against the real statute text. A quote that is not there is flagged.",
    confidence: { high: "High confidence", medium: "Medium confidence", low: "Low confidence" },
    newQ: "Ask another question",
    openSource: "Open the source PDF",
    langLabel: "Answer in Pidgin",
    expand: "Read full section",
    collapse: "Hide full section",
  },
  pcm: {
    tagline: "Sabi your right under Naija law.",
    sub: "Tell Wetin wetin happen. You go get plain answer wey come only from the real sections of Nigerian law, and every quote don check against the statute text.",
    placeholder: "Wetin happen? Like: my landlord say make I pack out in 7 days…",
    ask: "Ask",
    examples: [
      "Police stop me for road, dem wan search my phone",
      "My landlord say make I pack out of my flat for Lagos in 7 days",
      "My oga never pay my salary for two months",
      "One loan app dey threaten to message all my contacts",
      "Dem arrest my brother since yesterday, dem no gree give bail",
    ],
    understood: "Wetin you dey ask",
    reading: "Sections wey we dey read",
    answer: "Wetin the law talk",
    steps: "Wetin you fit do now",
    cited: "Sections wey we cite",
    alsoRead: "We read am too, but no cite",
    verified: "verified for statute text",
    unverified: "quote no dey exactly",
    draft: "Draft this document",
    drafting: "E dey draft…",
    copy: "Copy",
    copied: "Don copy",
    print: "Print",
    disclaimer: "Wetin na guide, no be lawyer. E dey explain wetin the written law talk. For your own matter, contact one of the free legal help services below.",
    notCovered: "The laws wey Wetin get now no clearly cover this one. The answer below na only wetin dem talk.",
    urgent: "Dem dey hold person right now?",
    urgentBody: "Under section 35 of the Constitution, person wey dem arrest must reach court within 24 hours if court dey within 40 km, if not, within 48 hours. Ask for the station name and the officer name, then call lawyer or Legal Aid Council.",
    help: "Free legal help",
    how: "How Wetin dey check itself",
    how1: "E find the sections",
    how1b: "Your question turn to legal search words and e match against 1,139 sections of six Nigerian laws.",
    how2: "E answer only from them",
    how2b: "The model fit only cite the sections wey e see. Any citation outside that set, we comot am before you see am.",
    how3: "E verify every quote",
    how3b: "Each quote dey string-match against the real statute text. Quote wey no dey there, we flag am.",
    confidence: { high: "High confidence", medium: "Medium confidence", low: "Low confidence" },
    newQ: "Ask another question",
    openSource: "Open the source PDF",
    langLabel: "Answer for Pidgin",
    expand: "Read full section",
    collapse: "Hide full section",
  },
};

const HELP = [
  { name: "Legal Aid Council of Nigeria", what: "Free lawyers for people who cannot pay", url: "https://legalaidcouncil.gov.ng" },
  { name: "National Human Rights Commission", what: "Complaints about rights abuses, including police", url: "https://www.nigeriarights.gov.ng" },
  { name: "Police Service Commission", what: "Complaints against police officers", url: "https://psc.gov.ng" },
  { name: "Nigeria Data Protection Commission", what: "Complaints about misuse of your personal data", url: "https://ndpc.gov.ng" },
];

function label(s: Section) {
  return `${s.statuteShort}, s. ${s.section}`;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split section text around the quote so it can be highlighted; tolerant to whitespace/punctuation drift. */
function highlight(text: string, quote?: string): (string | { mark: string })[] {
  if (!quote) return [text];
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  const pattern = words.map((w) => escapeRe(w.replace(/[^\w()]/g, "")).replace(/\\\(/g, "\\(?").replace(/\\\)/g, "\\)?")).join("[\\s\\S]{0,4}?");
  try {
    const re = new RegExp(pattern, "i");
    const m = re.exec(text);
    if (!m) return [text];
    return [text.slice(0, m.index), { mark: m[0] }, text.slice(m.index + m[0].length)];
  } catch {
    return [text];
  }
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [status, setStatus] = useState("");
  const [understood, setUnderstood] = useState<{ text: string; urgent: boolean } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [ans, setAns] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [letter, setLetter] = useState<{ loading: boolean; text: string; error?: string }>({ loading: false, text: "" });
  const [copied, setCopied] = useState(false);
  const askedQ = useRef("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const t = T[lang];

  useEffect(() => {
    try {
      const l = localStorage.getItem("wetin.lang") as Lang | null;
      if (l === "en" || l === "pcm") setLang(l);
      const th = localStorage.getItem("wetin.theme");
      const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = th === "dark" || th === "light" ? th : prefers ? "dark" : "light";
      setTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    } catch {}
  }, []);
  const toggleTheme = () => {
    const n = theme === "dark" ? "light" : "dark";
    setTheme(n);
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem("wetin.theme", n); } catch {}
  };
  const switchLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("wetin.lang", l); } catch {}
  };

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const citedIds = useMemo(() => new Set((ans?.citations ?? []).map((c) => c.id)), [ans]);
  const citationById = useMemo(() => new Map((ans?.citations ?? []).map((c) => [c.id, c])), [ans]);

  const ask = useCallback(async (q: string) => {
    const qq = q.trim();
    if (!qq || phase === "working") return;
    askedQ.current = qq;
    setQuestion(qq);
    setPhase("working"); setStatus(""); setUnderstood(null); setSections([]); setAns(null); setError(""); setOpen(new Set()); setLetter({ loading: false, text: "" });
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: qq, lang }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") setStatus(ev.text);
          else if (ev.type === "understood") setUnderstood({ text: ev.text, urgent: !!ev.urgent });
          else if (ev.type === "sections") setSections(ev.sections);
          else if (ev.type === "answer") { setAns(ev); setPhase("done"); }
          else if (ev.type === "error") throw new Error(ev.message);
        }
      }
      setPhase((p) => (p === "working" ? "error" : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [lang, phase]);

  const jumpTo = (id: string) => {
    setOpen((o) => new Set(o).add(id));
    setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };

  const mdAnswer = useMemo(() => {
    if (!ans) return "";
    return ans.answer.replace(/\[\[([^\]]+)\]\]/g, (_m, id) => {
      const s = byId.get(id);
      return s ? `[${label(s)}](#sec-${id})` : "";
    });
  }, [ans, byId]);

  const draftLetter = async () => {
    if (!ans?.letterType) return;
    setLetter({ loading: true, text: "" });
    try {
      const res = await fetch("/api/letter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: askedQ.current, answer: ans.answer, sectionIds: ans.citations.map((c) => c.id), letterType: ans.letterType }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setLetter({ loading: false, text: data.letter });
    } catch (e) {
      setLetter({ loading: false, text: "", error: e instanceof Error ? e.message : String(e) });
    }
  };
  const copyLetter = async () => {
    try { await navigator.clipboard.writeText(letter.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const cited = sections.filter((s) => citedIds.has(s.id));
  const uncited = sections.filter((s) => !citedIds.has(s.id));

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-bg/80 border-b border-line">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
          <a href="/" className="flex items-baseline gap-2">
            <span className="font-serif text-2xl leading-none tracking-tight">Wetin</span>
            <span className="hidden sm:inline text-xs text-muted">know your right</span>
          </a>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Language" className="flex rounded-full border border-line bg-card p-0.5 text-xs font-medium">
              {(["en", "pcm"] as Lang[]).map((l) => (
                <button key={l} onClick={() => switchLang(l)} aria-pressed={lang === l} className={`px-3 py-1 rounded-full transition ${lang === l ? "bg-green text-white" : "text-ink-2 hover:text-ink"}`}>
                  {l === "en" ? "English" : "Pidgin"}
                </button>
              ))}
            </div>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="h-8 w-8 grid place-items-center rounded-full border border-line bg-card text-ink-2 hover:text-ink">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className={`mx-auto max-w-6xl px-4 ${phase === "idle" ? "pt-14 pb-10 sm:pt-24" : "pt-8 pb-4"}`}>
          <div className={`mx-auto ${phase === "idle" ? "max-w-2xl text-center" : "max-w-3xl"}`}>
            {phase === "idle" && (
              <>
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green bg-green-soft rounded-full px-3 py-1 mb-5"><ShieldCheck size={13} /> Six Nigerian statutes · 1,139 sections · every quote verified</p>
                <h1 className="font-serif text-[2.6rem] leading-[1.05] sm:text-6xl tracking-tight">
                  <span className="italic">Wetin</span> be my right?
                </h1>
                <p className="mt-4 text-ink-2 text-base sm:text-lg leading-relaxed">{t.sub}</p>
              </>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); ask(question); }}
              className={`relative rounded-2xl border border-line bg-card shadow-[0_1px_0_rgba(0,0,0,0.03),0_12px_40px_-20px_rgba(15,92,52,0.35)] focus-within:border-green/60 transition ${phase === "idle" ? "mt-8 text-left" : "mt-2"}`}
            >
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
                rows={phase === "idle" ? 3 : 2}
                placeholder={t.placeholder}
                aria-label="Your question"
                className="w-full resize-none bg-transparent px-4 pt-4 pb-14 text-base sm:text-lg outline-none placeholder:text-muted"
              />
              <div className="absolute bottom-2 left-3 right-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted hidden sm:inline-flex items-center gap-1"><Languages size={13} /> English or Pidgin · Enter to ask</span>
                <button type="submit" disabled={phase === "working" || !question.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green text-white px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-green-2 transition">
                  {t.ask} <ArrowUp size={15} />
                </button>
              </div>
            </form>
            {phase === "idle" && (
              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {t.examples.map((ex) => (
                  <button key={ex} onClick={() => ask(ex)} className="text-sm text-ink-2 bg-bg-2 hover:bg-green-soft hover:text-green border border-line rounded-full px-3 py-1.5 transition text-left">
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Results */}
        <div ref={resultsRef} />
        {phase !== "idle" && (
          <section className="mx-auto max-w-6xl px-4 pb-16">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 space-y-5">
                {understood && (
                  <div className="rise rounded-xl border border-line bg-card p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t.understood}</p>
                    <p className="mt-1 text-ink-2">{understood.text}</p>
                  </div>
                )}
                {understood?.urgent && (
                  <div className="rise rounded-xl border border-red/30 bg-red-soft p-4 flex gap-3">
                    <AlertTriangle className="shrink-0 text-red mt-0.5" size={18} />
                    <div><p className="font-semibold">{t.urgent}</p><p className="text-sm text-ink-2 mt-1">{t.urgentBody}</p></div>
                  </div>
                )}
                {phase === "working" && (
                  <div className="rise rounded-xl border border-line bg-card p-5 flex items-center gap-3 text-ink-2">
                    <span className="flex gap-1" aria-hidden><i className="dot h-2 w-2 rounded-full bg-green" /><i className="dot h-2 w-2 rounded-full bg-green" /><i className="dot h-2 w-2 rounded-full bg-green" /></span>
                    <span className="text-sm">{status || "…"}</span>
                  </div>
                )}
                {phase === "error" && (
                  <div className="rise rounded-xl border border-red/30 bg-red-soft p-4 text-sm">
                    <p className="font-semibold text-red">Something went wrong</p>
                    <p className="mt-1 text-ink-2 break-words">{error || "No answer was produced."}</p>
                  </div>
                )}
                {ans && (
                  <article className="rise rounded-2xl border border-line bg-card p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-serif text-2xl">{t.answer}</h2>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${ans.confidence === "high" ? "bg-green-soft text-green" : ans.confidence === "medium" ? "bg-gold-soft text-ink" : "bg-red-soft text-red"}`}>
                          {ans.confidence === "low" ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />} {t.confidence[ans.confidence]}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-bg-2 px-2.5 py-1 text-ink-2" title={t.verified}>
                          <Check size={13} /> {ans.grounding.verified}/{ans.grounding.cited} {lang === "en" ? "quotes verified" : "quotes don verify"}
                        </span>
                      </div>
                    </div>
                    {ans.notInCorpus && <p className="mt-3 text-sm rounded-lg bg-gold-soft px-3 py-2">{t.notCovered}</p>}
                    <div className="prose-answer mt-4 text-[15.5px] sm:text-base">
                      <ReactMarkdown components={{ a: ({ href, children }) => href?.startsWith("#sec-") ? <a href={href} className="cite" onClick={(e) => { e.preventDefault(); jumpTo(href.slice(5)); }}>{children}</a> : <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>
                        {mdAnswer}
                      </ReactMarkdown>
                    </div>
                    {ans.steps?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t.steps}</h3>
                        <ol className="mt-2 space-y-2">
                          {ans.steps.map((s, i) => (
                            <li key={i} className="flex gap-3 text-[15px]"><span className="shrink-0 h-6 w-6 rounded-full bg-green text-white grid place-items-center text-xs font-bold">{i + 1}</span><span className="pt-0.5">{s}</span></li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {ans.letterType && (
                      <div className="mt-6 border-t border-line pt-5">
                        {!letter.text && (
                          <button onClick={draftLetter} disabled={letter.loading} className="inline-flex items-center gap-2 rounded-full border border-green text-green hover:bg-green-soft px-4 py-2 text-sm font-semibold disabled:opacity-60 transition">
                            <FileText size={15} /> {letter.loading ? t.drafting : `${t.draft}: ${ans.letterType}`}
                          </button>
                        )}
                        {letter.error && <p className="mt-2 text-sm text-red">{letter.error}</p>}
                        {letter.text && (
                          <div className="rise">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <h3 className="font-serif text-xl">{ans.letterType}</h3>
                              <div className="flex gap-2">
                                <button onClick={copyLetter} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-bg-2">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t.copied : t.copy}</button>
                                <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-bg-2">{t.print}</button>
                              </div>
                            </div>
                            <div className="letter rounded-xl border border-line bg-bg p-5 text-[15px]"><ReactMarkdown>{letter.text}</ReactMarkdown></div>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="mt-6 text-xs text-muted leading-relaxed">{t.disclaimer}</p>
                  </article>
                )}
                {phase === "done" && (
                  <button onClick={() => { setPhase("idle"); setQuestion(""); setAns(null); setSections([]); setUnderstood(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm text-green font-medium hover:underline">{t.newQ}</button>
                )}
              </div>

              {/* Sections panel */}
              <aside className="lg:col-span-5 space-y-3">
                {sections.length > 0 && (
                  <p className="text-[11px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5"><BookOpenText size={13} /> {ans ? t.cited : t.reading}</p>
                )}
                {(ans ? cited : sections).map((s) => (
                  <SectionCard key={s.id} s={s} c={citationById.get(s.id)} open={open.has(s.id)} toggle={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} t={t} />
                ))}
                {ans && uncited.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[11px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5 py-2"><ChevronDown size={13} className="transition group-open:rotate-180" /> {t.alsoRead} ({uncited.length})</summary>
                    <div className="space-y-3 mt-1">
                      {uncited.map((s) => <SectionCard key={s.id} s={s} open={open.has(s.id)} toggle={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} t={t} dim />)}
                    </div>
                  </details>
                )}
              </aside>
            </div>
          </section>
        )}

        {phase === "idle" && (
          <section className="mx-auto max-w-6xl px-4 pb-16">
            <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
              <h2 className="font-serif text-2xl flex items-center gap-2"><Sparkles size={18} className="text-green" /> {t.how}</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                {[[t.how1, t.how1b], [t.how2, t.how2b], [t.how3, t.how3b]].map(([h, b], i) => (
                  <div key={h} className="relative pl-10">
                    <span className="absolute left-0 top-0 h-7 w-7 rounded-full bg-green-soft text-green grid place-items-center text-sm font-bold">{i + 1}</span>
                    <p className="font-semibold">{h}</p>
                    <p className="mt-1 text-sm text-ink-2 leading-relaxed">{b}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-muted">Statutes: Constitution 1999 · Police Act 2020 · Administration of Criminal Justice Act 2015 · Nigeria Data Protection Act 2023 · Labour Act · Lagos Tenancy Law 2011</p>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line bg-bg-2/60">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="font-semibold flex items-center gap-2"><LifeBuoy size={16} className="text-green" /> {t.help}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {HELP.map((h) => (
                <li key={h.name}><a href={h.url} target="_blank" rel="noreferrer" className="font-medium hover:underline inline-flex items-center gap-1">{h.name} <ExternalLink size={12} className="text-muted" /></a><span className="text-muted"> · {h.what}</span></li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-muted leading-relaxed sm:text-right">
            <p className="font-serif text-xl text-ink">Wetin</p>
            <p className="mt-2">Built for LexHack 2026 · Access to Justice &amp; Civic Tech.</p>
            <p>Open source. Not legal advice.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionCard({ s, c, open, toggle, t, dim }: { s: Section; c?: Citation; open: boolean; toggle: () => void; t: (typeof T)["en"]; dim?: boolean }) {
  const parts = useMemo(() => highlight(s.text, c?.quote), [s.text, c?.quote]);
  const hasMark = parts.some((p) => typeof p !== "string");
  return (
    <div id={`sec-${s.id}`} className={`rise scroll-mt-20 rounded-xl border bg-card p-4 ${c ? "border-green/40" : "border-line"} ${dim ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-green">{s.statuteShort}</p>
          <p className="font-semibold leading-snug">s. {s.section}{s.title ? ` · ${s.title}` : ""}</p>
          <p className="text-[11px] text-muted mt-0.5">{s.jurisdiction}</p>
        </div>
        {c && (
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.verified ? "bg-green-soft text-green" : "bg-gold-soft text-ink"}`} title={c.verified ? t.verified : t.unverified}>
            {c.verified ? <Check size={11} /> : <AlertTriangle size={11} />} {c.verified ? t.verified : t.unverified}
          </span>
        )}
      </div>
      {c?.why && <p className="mt-2 text-sm text-ink-2">{c.why}</p>}
      {c?.quote && !open && (
        <blockquote className="mt-2 text-sm border-l-2 border-gold pl-3 text-ink-2 italic">“{c.quote}”</blockquote>
      )}
      {open && (
        <p className="statute-text mt-3 text-[13.5px] text-ink-2">
          {hasMark ? parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <mark key={i}>{p.mark}</mark>)) : s.text}
        </p>
      )}
      {!open && !c && <p className="mt-2 text-sm text-ink-2 line-clamp-3">{s.text}</p>}
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button onClick={toggle} className="inline-flex items-center gap-1 text-green font-medium hover:underline"><ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} /> {open ? t.collapse : t.expand}</button>
        <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink"><ExternalLink size={12} /> {t.openSource}</a>
      </div>
    </div>
  );
}
