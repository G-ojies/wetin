# Wetin — know your rights under Nigerian law

**Wetin be my right?** Ask in English or Nigerian Pidgin what happened to you. Wetin answers in plain language using *only* the actual sections of Nigerian law, cites each one, and verifies every quoted excerpt against the statute text before you see it.

**Live:** https://wetin.vercel.app · **Demo video:** https://youtu.be/wEiaRuKoCf8

Built for **LexHack 2026** (Access to Justice & Civic Tech).

## Why

Most Nigerians never see a lawyer. Police stops, evictions, unpaid wages and loan-app harassment are daily events, and the law that protects people is locked in scanned PDFs. Generic chatbots answer confidently and hallucinate section numbers. Wetin is built so it cannot: the model only sees retrieved sections, may only cite those, and every quote is string-matched against the real text. If a quote is not there, it is flagged.

## What it does

1. **Understands the question** (English or Pidgin) and turns it into statutory search terms.
2. **Retrieves** the most relevant sections with BM25 (MiniSearch) from a 1,460-section corpus of eight statutes.
3. **Answers only from those sections**, with inline citations that jump to the section text.
4. **Verifies** each quoted excerpt against the statute; citations outside the retrieved set are dropped server-side.
5. **Drafts the document** you actually need next: demand letter to a landlord, petition to the Police Service Commission, complaint to the NDPC, letter to an employer.
6. Ships an **offline rights card** for police stops at `/card`: ten rights with verbatim statute quotes, an emergency contact saved on the device, English and Pidgin, usable with no network.
7. Flags **urgent** situations (someone detained now) with the constitutional 24/48-hour rule and links to free legal help.

## Corpus

| Statute | Sections | Source |
| --- | --- | --- |
| Constitution of the Federal Republic of Nigeria 1999 | 319 | jonapwd.org PDF |
| Nigeria Police Act 2020 | 128 | sabilaw.org PDF |
| Administration of Criminal Justice Act 2015 | 491 | policinglaw.info PDF |
| Nigeria Data Protection Act 2023 | 63 | dataguidance.com PDF |
| Cybercrimes (Prohibition, Prevention, etc.) Act 2015 | 56 | nfiu.gov.ng PDF |
| Child's Rights Act 2003 | 266 | placng.org PDF |
| Labour Act (Cap. L1, LFN 2004) | 90 | lawsofnigeria.placng.org PDF |
| Tenancy Law of Lagos State 2011 | 47 | sabilaw.org PDF |

Text is extracted with `pdftotext` and split into sections by `scripts/build-corpus.py`. Some sources are OCR scans, so minor character errors remain; the source PDF is linked from every section card. Where a scan lost a section heading, the heading is recovered from the margin note embedded in the text (157 of 1460 sections, flagged `titleDerived` in the corpus). The Cybercrimes Act text is the 2015 version; the Act was amended in 2024.

## Stack

- Next.js 16 (App Router), React 19, Tailwind 4, TypeScript
- MiniSearch (BM25 retrieval, in-process, no vector DB)
- Any OpenAI-compatible LLM endpoint. The live demo runs on Groq: GPT-OSS 120B for answers, Qwen 27B for query expansion and reranking, with automatic fallback between models.
- `react-markdown`, `lucide-react`

## Run it

```bash
npm install
cp .env.example .env.local   # add one API key
npm run dev
```

Environment (pick one provider):

| Variable | Notes |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (default provider) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` | Auto-detected presets |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FAST_MODEL` | Override any OpenAI-compatible endpoint |
| `LLM_PROVIDER=claude-cli` | Dev only: uses the local `claude -p` CLI, no key |

Rebuild the corpus from the PDFs:

```bash
python3 scripts/build-corpus.py <dir-with-statute-txt> src/data/corpus.json
```

## Limits

- A guide, not legal advice. The app says so on every answer.
- Lagos Tenancy Law covers Lagos State only (and excludes Apapa, Ikeja GRA, Ikoyi, Victoria Island). ACJA covers federal courts and the FCT; most states have similar ACJ laws.
- Eight statutes today. Adding one is a PDF and a few lines of config.

## License

MIT
