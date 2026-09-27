"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Download, Phone, Printer, ShieldCheck, WifiOff } from "lucide-react";
import { CARD_DO, CARD_ITEMS } from "@/data/rights-card";

type Lang = "en" | "pcm";

const T = {
  en: {
    back: "Back to Wetin",
    title: "Your rights when police stop or arrest you",
    sub: "Keep this card on your phone. It works with no data and no network.",
    rights: "Your rights",
    doNow: "What to do",
    contact: "My emergency contact",
    contactHint: "Saved only on this phone. Call them first.",
    name: "Name (lawyer, family or friend)",
    phone: "Phone number",
    save: "Save",
    saved: "Saved on this phone",
    call: "Call",
    offlineReady: "Saved for offline use",
    offlineWait: "Open this page once with data to save it for offline use",
    print: "Print",
    install: "Add to home screen from your browser menu to open it like an app.",
    verified: "Every quote on this card is checked against the statute text.",
    disclaimer: "Wetin is a guide, not a lawyer. These rights come from the Constitution, the Police Act 2020 and the Administration of Criminal Justice Act 2015.",
    help: "Free legal help: Legal Aid Council of Nigeria, National Human Rights Commission, Police Service Commission.",
  },
  pcm: {
    back: "Go back to Wetin",
    title: "Your right when police stop you or arrest you",
    sub: "Keep this card for your phone. E dey work without data and without network.",
    rights: "Your rights",
    doNow: "Wetin you go do",
    contact: "My emergency contact",
    contactHint: "E dey save only for this phone. Call dem first.",
    name: "Name (lawyer, family or friend)",
    phone: "Phone number",
    save: "Save",
    saved: "E don save for this phone",
    call: "Call",
    offlineReady: "E don save, e go work offline",
    offlineWait: "Open this page once with data make e save for offline",
    print: "Print",
    install: "Add am to home screen from your browser menu make e open like app.",
    verified: "Every quote for this card don check against the statute text.",
    disclaimer: "Wetin na guide, no be lawyer. These rights come from the Constitution, the Police Act 2020 and the Administration of Criminal Justice Act 2015.",
    help: "Free legal help: Legal Aid Council of Nigeria, National Human Rights Commission, Police Service Commission.",
  },
};

export default function CardPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [offline, setOffline] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [saved, setSaved] = useState(false);
  const t = T[lang];

  useEffect(() => {
    try {
      const l = localStorage.getItem("wetin.lang");
      if (l === "en" || l === "pcm") setLang(l);
      const th = localStorage.getItem("wetin.theme");
      if (th === "dark" || th === "light") document.documentElement.dataset.theme = th;
      const c = localStorage.getItem("wetin.contact");
      if (c) setContact(JSON.parse(c));
    } catch {}
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => setOffline(true)).catch(() => {});
    }
  }, []);

  const switchLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("wetin.lang", l); } catch {}
  };
  const saveContact = () => {
    try { localStorage.setItem("wetin.contact", JSON.stringify(contact)); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {}
  };
  const tel = contact.phone.replace(/[^\d+]/g, "");

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-bg/80 border-b border-line print:hidden">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={15} /> {t.back}</a>
          <div role="group" aria-label="Language" className="flex rounded-full border border-line bg-card p-0.5 text-xs font-medium">
            {(["en", "pcm"] as Lang[]).map((l) => (
              <button key={l} onClick={() => switchLang(l)} aria-pressed={lang === l} className={`px-3 py-1 rounded-full transition ${lang === l ? "bg-green text-white" : "text-ink-2 hover:text-ink"}`}>
                {l === "en" ? "English" : "Pidgin"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 ${offline ? "text-green bg-green-soft" : "text-ink-2 bg-bg-2"} print:hidden`}>
          {offline ? <Check size={13} /> : <WifiOff size={13} />} {offline ? t.offlineReady : t.offlineWait}
        </p>
        <h1 className="mt-4 font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">{t.title}</h1>
        <p className="mt-3 text-ink-2">{t.sub}</p>

        <section className="mt-8 rounded-2xl border border-red/30 bg-red-soft p-5 print:hidden">
          <h2 className="font-semibold flex items-center gap-2"><Phone size={16} className="text-red" /> {t.contact}</h2>
          <p className="text-sm text-ink-2 mt-1">{t.contactHint}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder={t.name} aria-label={t.name} className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-green/60" />
            <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder={t.phone} aria-label={t.phone} inputMode="tel" className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-green/60" />
            <button onClick={saveContact} className="rounded-lg bg-ink text-bg px-4 py-2 text-sm font-semibold">{saved ? t.saved : t.save}</button>
          </div>
          {tel.length >= 7 && (
            <a href={`tel:${tel}`} className="mt-3 inline-flex items-center gap-2 rounded-full bg-red text-white px-5 py-2.5 text-sm font-semibold">
              <Phone size={15} /> {t.call} {contact.name || contact.phone}
            </a>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t.doNow}</h2>
          <ol className="mt-3 space-y-2">
            {CARD_DO[lang].map((s, i) => (
              <li key={i} className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-green text-white grid place-items-center text-xs font-bold">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t.rights}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {CARD_ITEMS.map((it) => (
              <li key={it.id} className="rounded-xl border border-line bg-card p-4 break-inside-avoid">
                <p className="font-semibold leading-snug">{lang === "en" ? it.en : it.pcm}</p>
                <blockquote className="mt-2 text-sm border-l-2 border-gold pl-3 text-ink-2 italic">“{it.quote}”</blockquote>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-green">{it.cite}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-xs text-green inline-flex items-center gap-1.5"><ShieldCheck size={13} /> {t.verified}</p>
        <p className="mt-3 text-sm text-ink-2">{t.help}</p>
        <p className="mt-3 text-xs text-muted leading-relaxed">{t.disclaimer}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-bg-2"><Printer size={15} /> {t.print}</button>
          <span className="text-xs text-muted inline-flex items-center gap-1.5"><Download size={13} /> {t.install}</span>
        </div>
      </main>
    </div>
  );
}
