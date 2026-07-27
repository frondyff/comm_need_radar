"""Extract organizations from the 211 / Centraide "Directory of Social and
Community Resources" PDF into structured CSVs.

Source PDF (licensed; kept out of the public repo -- place it here yourself):
    data/raw/service_sources/_211/montreal2-en.pdf

Outputs (also gitignored under _211/):
    montreal_social_resources.csv          one row per (org x category) listing
    montreal_social_resources_unique.csv   one row per organization (categories joined)

Credit: 211 Grand Montreal / Centraide. Academic use only.
"""
from pathlib import Path
import csv
import re
import sys

import pandas as pd
import pypdf

SRC = Path(__file__).resolve().parents[2] / "data" / "raw" / "service_sources" / "_211"
PDF = SRC / "montreal2-en.pdf"
OUT = SRC / "montreal_social_resources.csv"
OUT_UNIQUE = SRC / "montreal_social_resources_unique.csv"

if not PDF.exists():
    sys.exit(f"Missing source PDF: {PDF}\nPlace the 211 directory PDF there first.")

r = pypdf.PdfReader(str(PDF))
n_pages = len(r.pages)

toc = "\n".join((r.pages[p].extract_text() or "") for p in range(0, 5))
CATEGORIES = {m.group(1).strip().lower()
              for line in toc.split("\n")
              if (m := re.match(r"^(.+?)\s+\d+\s*$", line.strip()))
              and len(m.group(1).strip()) > 2 and any(c.isalpha() for c in m.group(1))}

LABELS = ["Website", "Email", "Services", "Eligibility", "Capacity", "Coverage area",
          "Hours", "Fees", "Financing", "Legal status", "Clientele", "Other Activities",
          "National Organization", "Accessibility", "Registration", "Languages"]
LABEL_ALT = "|".join(re.escape(l) for l in LABELS)
FIELD_PREFIXES = tuple(l + ":" for l in LABELS) + ("Fax:", "*")
PHONE = re.compile(r"(?:1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")


def is_org_name(s):
    s = s.strip()
    if len(s) < 3 or s.startswith(FIELD_PREFIXES) or s.lower() in CATEGORIES:
        return False
    letters = [c for c in s if c.isalpha()]
    return len(letters) >= 2 and sum(c.isupper() for c in letters) / len(letters) > 0.85


def parse_block(name, category, block):
    txt = "\n".join(block)
    rec = {"name": name, "category": category, "address": "", "phone": "", "fax": "",
           "website": "", "email": "", "services": "", "clientele": "", "coverage_area": "",
           "hours": "", "fees": "", "legal_status": ""}
    for lab in LABELS:
        m = re.search(rf"{re.escape(lab)}:\s*(.*?)(?=\n(?:{LABEL_ALT}):|\Z)", txt, re.S)
        if m:
            rec[lab.lower().replace(" ", "_")] = " ".join(m.group(1).split())
    head = re.split(rf"\n(?:{LABEL_ALT}):", txt)[0]
    fx = re.search(r"Fax:\s*(" + PHONE.pattern + ")", head)
    if fx:
        rec["fax"] = fx.group(1).strip()
    ph = PHONE.search(re.sub(r"Fax:.*", "", head))
    if ph:
        rec["phone"] = ph.group(0).strip()
    addr = []
    for l in head.split("\n"):
        l = l.strip()
        if not l or l.lower() == category.lower():
            continue
        if PHONE.search(l) or l.startswith("Fax"):
            break
        addr.append(l)
    rec["address"] = " ".join(addr)
    return rec


orgs, cur_cat, cur_name, cur_block = [], "", None, []


def flush():
    global cur_name, cur_block
    if cur_name:
        orgs.append(parse_block(cur_name, cur_cat, cur_block))
    cur_name, cur_block = None, []


for p in range(5, n_pages):
    if p % 400 == 0:
        print(f"  ...page {p}/{n_pages}", file=sys.stderr)
    for raw in (r.pages[p].extract_text() or "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.lower() in CATEGORIES and not is_org_name(line):
            cur_cat = line
            continue
        if is_org_name(line):
            flush()
            cur_name, cur_block = line, []
            continue
        if cur_name:
            cur_block.append(line)
flush()

cols = ["name", "category", "address", "phone", "fax", "email", "website",
        "coverage_area", "hours", "fees", "clientele", "legal_status", "services"]
pd.DataFrame(orgs)[cols].to_csv(OUT, index=False)


def first_real(s):
    vals = [str(v).strip() for v in s if pd.notna(v) and str(v).strip()]
    real = [v for v in vals if "confidential" not in v.lower()]
    return (real or vals or [""])[0]


df = pd.read_csv(OUT)
uniq = df.groupby("name").agg(
    categories=("category", lambda s: "; ".join(sorted({str(x) for x in s if pd.notna(x)}))),
    address=("address", first_real), phone=("phone", first_real),
    website=("website", first_real), email=("email", first_real),
    coverage_area=("coverage_area", first_real), hours=("hours", first_real),
    services=("services", first_real),
).reset_index()
uniq.to_csv(OUT_UNIQUE, index=False)
print(f"Extracted {len(df)} listings -> {len(uniq)} unique organizations")
