"""
org_parser.py — heading-based section detection for institution documents
(Vision / Mission / PO / PSO / PEO / WK / Academic Objectives).

HONEST SCOPE: this is a best-effort heuristic parser. Institution documents vary
wildly in formatting, so detection is imperfect BY DESIGN — the output is a set of
*suggestions* that the admin reviews and corrects in a preview UI before anything
is saved. It never auto-applies. When in doubt it returns items under 'unmatched'
rather than guessing.
"""
import re

# Heading patterns -> canonical section key. Matched case-insensitively against a
# line that looks like a heading (short, often ending with ':' or a colon-less title).
SECTION_PATTERNS = [
    ("instituteVision",  [r"institute\s+vision", r"college\s+vision"]),
    ("instituteMission", [r"institute\s+mission", r"college\s+mission"]),
    ("vision",           [r"department\s+vision", r"\bvision\b"]),
    ("mission",          [r"department\s+mission", r"\bmission\b"]),
    ("programOutcomes",  [r"program(me)?\s+outcomes?", r"\bpos?\b\s*$"]),
    ("programSpecificOutcomes", [r"program(me)?\s+specific\s+outcomes?", r"\bpsos?\b"]),
    ("peos",             [r"program(me)?\s+educational\s+objectives?", r"\bpeos?\b"]),
    ("wks",              [r"knowledge\s+and\s+attitude\s+profile", r"\bwk\b", r"knowledge\s+profile"]),
    ("academicObjectives", [r"academic\s+objectives?"]),
]

# Order matters: more specific (institute/dept, PSO before PO) checked first.
def _match_heading(line: str):
    s = line.strip().lower().strip(":").strip()
    if not s or len(s) > 80:   # headings are short
        return None
    # PSO before PO, institute/dept vision-mission before generic
    for key, pats in SECTION_PATTERNS:
        for pat in pats:
            if re.search(pat, s):
                # avoid matching a full sentence that merely contains the word:
                # require the heading to be mostly just the label
                words = re.findall(r"[a-zA-Z]+", s)
                if len(words) <= 8:
                    return key
    return None


def _clean_item(text: str) -> str:
    # strip leading list markers: "1.", "1)", "-", "*", "PO1:", "WK1:", "•"
    t = text.strip()
    t = re.sub(r"^[\u2022\-\*]\s*", "", t)
    t = re.sub(r"^\d+[.)]\s*", "", t)
    t = re.sub(r"\s+", " ", t)   # collapse the whitespace introduced by line-joins
    return t.strip()


def _looks_like_item(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    # bullet/numbered/keyword-prefixed lines, or reasonably long sentences
    if re.match(r"^(\d+[.)]|[\u2022\-\*]|PO\d+|PSO\d+|WK\d+|PEO\d+)", s, re.I):
        return True
    return len(s.split()) >= 4


def _is_item_start(line: str) -> bool:
    """A line that begins a NEW statement: numbered, bulleted, or PO#/WK# etc."""
    s = line.strip()
    return bool(re.match(r"^(\d+[.)]|[\u2022\-\*]|PO\s?\d+|PSO\s?\d+|WK\s?\d+|PEO\s?\d+)", s, re.I))


def detect_sections(text: str):
    """
    Split text into detected sections, grouping wrapped lines into whole
    statements. Returns { "sections": {key:[items]}, "unmatched": [items] }.
    Nothing is applied here — output is for admin review.
    """
    lines = [ln for ln in (text or "").splitlines()]
    sections = {}
    unmatched = []
    current = None
    buffer = []  # accumulates wrapped lines of the current statement

    def flush():
        nonlocal buffer
        if buffer:
            joined = _clean_item(" ".join(buffer).strip())
            # ignore table-ish noise and tiny fragments
            if joined and len(joined.split()) >= 3 and not _looks_like_table(joined):
                target = sections.setdefault(current, []) if current else unmatched
                target.append(joined)
        buffer = []

    for ln in lines:
        raw = ln.rstrip()
        if not raw.strip():
            flush()  # blank line ends a statement
            continue
        heading = _match_heading(raw)
        if heading:
            flush()
            current = heading
            sections.setdefault(current, [])
            continue
        if _is_item_start(raw):
            flush()               # new item starts -> close previous
            buffer.append(raw)
        else:
            # continuation of the current statement (wrapped line)
            if buffer:
                buffer.append(raw)
            elif current and len(raw.split()) >= 4:
                buffer.append(raw)  # first line of an unnumbered statement
    flush()

    sections = {k: v for k, v in sections.items() if v}
    return {"sections": sections, "unmatched": unmatched}


def _looks_like_table(text: str) -> bool:
    """Heuristic: consistency-matrix / status-table rows leak in as noise."""
    t = text.lower()
    if text.count("|") >= 2 or text.count("+--") >= 1:
        return True
    if re.match(r"^(missions?|peos?|objective|status|remark)\b", t) and len(text) < 40:
        return True
    return False
