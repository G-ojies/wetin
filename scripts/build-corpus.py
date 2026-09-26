#!/usr/bin/env python3
"""Parse pdftotext raw output of Nigerian statutes into section-level JSON."""
import json, re, sys, os
SRC = sys.argv[1]
OUT = sys.argv[2]

STATUTES = [
  dict(key="constitution", file="const-jonapwd.raw.txt", short="Constitution", name="Constitution of the Federal Republic of Nigeria 1999 (as amended)", year=1999, jurisdiction="Federal",
       start=r"^1\. \(1\) This Constitution is supreme", last=320,
       url="https://www.jonapwd.org/FRNconstitution.pdf"),
  dict(key="police-act", file="police-sabilaw.raw.txt", short="Police Act 2020", name="Nigeria Police Act 2020", year=2020, jurisdiction="Federal",
       start=r"^1\. The objective o ?f this ?Act", last=141,
       url="https://sabilaw.org/wp-content/uploads/2020/11/Police-Act-2020-1.pdf"),
  dict(key="acja", file="acja-policinglaw.raw.txt", short="ACJA 2015", name="Administration of Criminal Justice Act 2015", year=2015, jurisdiction="Federal (FCT and federal courts)",
       start=r"^\s*1\.\s*$", last=495, start_after=r"ADMINISTRATION OF CRIMINAL JUSTICE ACT|ENACTED",
       url="https://www.policinglaw.info/assets/downloads/2015_Administration_of_Criminal_Justice_Act.pdf"),
  dict(key="ndpa", file="ndpa-dataguidance.raw.txt", short="NDPA 2023", name="Nigeria Data Protection Act 2023", year=2023, jurisdiction="Federal",
       start=r"^1\. The objectives of this Act are to", last=66,
       url="https://placng.org/i/wp-content/uploads/2023/06/Nigeria-Data-Protection-Act-2023.pdf"),
  dict(key="labour-act", file="labour-act.raw.txt", short="Labour Act", name="Labour Act (Cap. L1, LFN 2004)", year=2004, jurisdiction="Federal",
       start=r"^1\. Manner of payment", last=91,
       url="http://lawsofnigeria.placng.org/laws/L1.pdf"),
  dict(key="tenancy-lagos", file="tenancy-lagos-2011.raw.txt", short="Lagos Tenancy Law 2011", name="Tenancy Law of Lagos State 2011", year=2011, jurisdiction="Lagos State",
       start=r"^\s*1\.-\(1\) This Law shall apply", last=47,
       url="https://sabilaw.org/wp-content/uploads/2021/08/Lagos-State-Tenancy-Law-2011.pdf"),
]

SEC_RE = re.compile(r"^\s*(\d{1,3})\.(?:[-\s]\s*(.*))?$")
FURNITURE = re.compile(r"(Proprietary/Internal|Downloaded for free|#SabiLaw|www\.LearnNigerianLaws|^\s*A\s?\d{3,4}\s*$|^\s*\d{1,4}\s*$|^\s*[A-Z]\s?\d+\s*$|^\f)")
SCHED_RE = re.compile(r"^\s*(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH)?\s*SCHEDULE", re.I)

def clean_line(l):
    l = l.replace("\f", "").rstrip()
    if FURNITURE.search(l): return None
    return l

def find_body_start(lines, pat, after=None):
    if pat:
        rx = re.compile(pat); begin = 0
        if after:
            ra = re.compile(after)
            for i, l in enumerate(lines):
                if ra.search(l) and i > 200: begin = i; break
        for i in range(begin, len(lines)):
            if rx.search(lines[i]):
                # require a "2." within 200 lines so we don't grab a list item
                if any(SEC_RE.match(lines[j]) and SEC_RE.match(lines[j]).group(1)=="2" for j in range(i+1, min(i+200,len(lines)))):
                    return i
        raise SystemExit(f"start not found: {pat}")
    # heuristic: first "1." line whose remainder is long and followed by a "2." within 60 lines
    for i, l in enumerate(lines):
        m = SEC_RE.match(l)
        if m and m.group(1) == "1" and len(m.group(2) or "") > 25:
            for j in range(i+1, min(i+80, len(lines))):
                m2 = SEC_RE.match(lines[j])
                if m2 and m2.group(1) == "2" and len(m2.group(2) or "") > 15:
                    return i
    raise SystemExit("heuristic start failed")

def arrangement_titles(lines, body_start):
    titles = {}
    for l in lines[:body_start]:
        m = SEC_RE.match(l)
        if not m: continue
        n = int(m.group(1)); t = (m.group(2) or "").strip()
        if 3 <= len(t) <= 110 and n not in titles and not t.startswith("("):
            titles[n] = t.rstrip(". ")
    return titles

LAYOUT_TITLE_RE = re.compile(r"(?<![\d(])(\d{1,3})\.\s{1,6}([A-Z][A-Za-z ,'’\-]{3,70}?)(?=\s{3,}\d{1,3}\.|\s*$|\s{3,})")
def layout_titles(st):
    path = os.path.join(SRC, st["file"].replace(".raw.txt", ".txt"))
    if not os.path.exists(path): return {}
    titles = {}; seen_body = 0
    for l in open(path, encoding="utf-8", errors="ignore"):
        for m in LAYOUT_TITLE_RE.finditer(l):
            n = int(m.group(1)); t = m.group(2).strip().rstrip(". ")
            if n not in titles and 1 <= n <= st["last"] + 2 and len(t) > 3:
                titles[n] = t
        if len(titles) >= st["last"]: break
    return titles

OCR_FIXES = [(r"\{I\}", "(1)"), (r"\(I\)", "(1)"), (r"\(l\)", "(1)"), (r"\(ii\)", "(ii)"), (r"~", ""), (r"\s([,.;:])", r"\1")]

def parse(st):
    raw = open(os.path.join(SRC, st["file"]), encoding="utf-8", errors="ignore").read().split("\n")
    lines = [clean_line(l) for l in raw]
    lines = [l for l in lines if l is not None]
    bs = find_body_start(lines, st["start"], st.get("start_after"))
    titles = layout_titles(st); titles.update({k:v for k,v in arrangement_titles(lines, bs).items() if k not in titles})
    secs = []; cur = None; expected = 1
    for l in lines[bs:]:
        m = SEC_RE.match(l)
        if m:
            n = int(m.group(1))
            if expected <= n <= expected + 2:
                if cur: secs.append(cur)
                cur = dict(n=n, lines=[m.group(2) or ""])
                expected = n + 1
                continue
        if cur and expected > st["last"] and SCHED_RE.match(l):
            break
        if cur is not None and l.strip():
            cur["lines"].append(l.strip())
    if cur: secs.append(cur)
    out = []
    for s in secs:
        text = " ".join(s["lines"])
        text = re.sub(r"\s+", " ", text)
        text = re.sub(r"\s(\((?:\d{1,2}|[a-z]{1,3}|[ivx]{1,4})\))\s", r"\n\1 ", text)
        for a,b in OCR_FIXES: text = re.sub(a, b, text)
        text = text.strip()
        if len(text) < 20: continue
        out.append(dict(id=f"{st['key']}:{s['n']}", statute=st["key"], statuteShort=st["short"], statuteName=st["name"],
                        jurisdiction=st["jurisdiction"], section=s["n"], title=titles.get(s["n"], ""), text=text, url=st["url"]))
    return out

CONST_TITLES = {33:"Right to life",34:"Right to dignity of human person",35:"Right to personal liberty",36:"Right to fair hearing",37:"Right to private and family life",38:"Right to freedom of thought, conscience and religion",39:"Right to freedom of expression and the press",40:"Right to peaceful assembly and association",41:"Right to freedom of movement",42:"Right to freedom from discrimination",43:"Right to acquire and own immovable property anywhere in Nigeria",44:"Compulsory acquisition of property",45:"Restriction on and derogation from fundamental rights",46:"Special jurisdiction of High Court and legal aid",1:"Supremacy of the Constitution",14:"The Government and the people",15:"Political objectives",17:"Social objectives",214:"Establishment of Nigeria Police Force",215:"Appointment of Inspector-General and control of Nigeria Police Force"}
all_secs = []
for st in STATUTES:
    secs = parse(st)
    if st["key"] == "constitution":
        for sec in secs: sec["title"] = CONST_TITLES.get(sec["section"], sec["title"])
    nums = [s["section"] for s in secs]
    print(f"{st['key']:14s} sections={len(secs)} range={nums[0] if nums else None}-{nums[-1] if nums else None} titled={sum(1 for s in secs if s['title'])} chars={sum(len(s['text']) for s in secs)}")
    all_secs += secs
json.dump(all_secs, open(OUT, "w"), ensure_ascii=False)
print("total", len(all_secs), "->", OUT)
