# Devpost submission: Wetin

**Project name:** Wetin

**Tagline:** Wetin be my right? Plain answers grounded in Nigerian law, in English or Pidgin, with every quote verified against the statute.

**Track:** Access to Justice & Civic Tech (also fits AI Safety, Ethics & Governance: grounded, verifiable legal AI)

**Live demo:** https://wetin.vercel.app (fill in after deploy)
**Repo:** https://github.com/G-ojies/wetin
**Video:** (YouTube link)

---

## Inspiration

I am a student in Nigeria. Everyone I know has a story: a police officer demanding to search a phone, a landlord giving seven days to leave, a salary that stops coming, a loan app threatening to message every contact. Almost nobody involved has ever spoken to a lawyer. The laws that protect people exist, but they live in scanned PDFs written for lawyers.

Chatbots do not fix this. Ask a general model about Nigerian tenancy law and it will confidently cite a section that does not exist. In law, a wrong answer delivered confidently is worse than no answer. So the question I set out to answer was: can an AI legal guide be built so that it *cannot* invent the law?

## What it does

Wetin takes a question in English or Nigerian Pidgin and answers with what the written law actually says.

1. **Understands** the question and rewrites it into statutory search terms (Pidgin "dem wan search my phone" becomes "police search person premises warrant grounds").
2. **Retrieves** the most relevant sections from a corpus of 1,134 sections across six statutes: the 1999 Constitution, the Police Act 2020, the Administration of Criminal Justice Act 2015, the Nigeria Data Protection Act 2023, the Labour Act, and the Lagos Tenancy Law 2011.
3. **Answers only from those sections.** Every claim carries an inline citation chip that jumps to the section text. Citations to anything outside the retrieved set are dropped on the server before the answer reaches the user.
4. **Verifies every quote.** Each quoted excerpt is string-matched against the real statute text and shown with a "verified in statute text" badge, highlighted inside the full section. A quote that is not there is flagged, not hidden.
5. **Gives next steps** and **drafts the document** the person actually needs: a demand letter to a landlord, a petition to the Police Service Commission, a complaint to the Nigeria Data Protection Commission, a letter to an employer.
6. **Flags urgency.** If someone is being held right now, it surfaces the constitutional 24/48-hour rule and links to free legal help.

## How we built it

- **Corpus:** downloaded the official gazette PDFs, extracted text with `pdftotext`, and wrote a parser (`scripts/build-corpus.py`) that finds each statute's body, walks the sections monotonically so schedules and tables do not confuse it, pulls titles from the arrangement-of-sections page, and fixes common OCR errors. Output is one JSON file of sections with source links.
- **Retrieval:** MiniSearch BM25 in-process, chunked by subsection, with definition sections excluded because they match everything. No vector database, so the whole app is one Next.js deploy.
- **Generation:** two model calls through Vercel AI Gateway. A fast model does query expansion; a stronger model writes the answer as strict JSON with citation tokens and verbatim quotes.
- **Grounding layer:** server-side checks that filter citations to the retrieved set and verify quotes against the section text (whitespace and punctuation tolerant). The UI shows the verification count on every answer.
- **Frontend:** Next.js 16, React 19, Tailwind 4. Mobile first, works in light and dark, English and Pidgin, streamed status so the person sees the sections being read before the answer arrives.

## Challenges

- **The law is locked in scans.** Three of the six statutes were image-only PDFs. Finding text-layer copies and cleaning OCR artefacts (`{I}` for `(1)`, split words) took a large part of the build.
- **Section parsing is not uniform.** Each gazette formats sections differently: numbers on their own line, marginal notes interleaved, three-column arrangement tables, schedules that restart numbering at 1. The parser had to be per-statute aware without being hand-written per statute.
- **Pidgin retrieval.** Lexical search on "dem carry my brother go station" returns nothing useful. Query expansion by a small model fixed this and made English and Pidgin equally usable.
- **Making the model honest.** Structured output plus a hard server-side filter turned out to be more reliable than any prompt instruction alone.

## Accomplishments

- In testing, every citation in the police-search and tenancy answers verified against the statute text, and the app shows that count on the answer itself.
- The same question works in English and in Pidgin, and the answer comes back in the language chosen.
- A working letter generator that cites only sections the person has just seen.
- The whole pipeline runs on one Next.js deploy with no vector database and any OpenAI-compatible model.

## What we learned

Grounding is a systems problem, not a prompting problem. The prompt asks for verbatim quotes, but the thing that makes the product trustworthy is the boring code that checks them. Also: people do not ask legal questions in legal language, and a cheap translation step before retrieval matters more than a bigger model after it.

## What's next

- More statutes: Criminal Code, Penal Code, state ACJ laws, Cybercrimes Act, Child Rights Act, and the tenancy laws of other states.
- Hausa, Yoruba and Igbo answers.
- A WhatsApp interface, since that is where Nigerians already are.
- An offline "rights card" for police stops that works with no data.
- Partnerships with the Legal Aid Council and campus legal clinics to route people to real help.

## Built with

Next.js, React, TypeScript, Tailwind CSS, MiniSearch, Vercel AI Gateway, Claude (Anthropic), Python, pdftotext, Vercel
