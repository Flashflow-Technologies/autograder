"""
Template-based question generation from course notes.

This is deliberately NOT an LLM. It runs fully offline/free using:
  - PyMuPDF / python-docx for text extraction,
  - the existing sentence-transformer embedder for salience ranking,
  - Bloom's-level question templates for construction.

The output is a set of BASIC, EDITABLE DRAFT questions. Quality is modest by
design (the constraint was strict-free-self-hosted); every question is meant to
be reviewed and refined by faculty in the exam builder before use.

RBTL is correct *by construction*: each question is built from a template keyed
to a target Bloom's level, and the caller (Node backend) only ever requests
levels at or below the CO's ceiling. So generated questions never exceed the CO
ceiling.
"""

import io
import re
import logging

logger = logging.getLogger("ai-service.generator")

# ---- Bloom's-level question templates --------------------------------------
# Each template takes a "concept" phrase. Verbs are chosen to match the level so
# the produced question genuinely reflects that cognitive level.
TEMPLATES = {
    "L1": [
        "Define {concept}.",
        "List the key characteristics of {concept}.",
        "State the main components of {concept}.",
        "Identify the important terms associated with {concept}.",
    ],
    "L2": [
        "Explain the concept of {concept}.",
        "Describe how {concept} works.",
        "Summarize the main ideas behind {concept}.",
        "Illustrate {concept} with a suitable example.",
    ],
    "L3": [
        "Apply {concept} to solve a practical problem.",
        "Demonstrate the use of {concept} with a worked example.",
        "Show how {concept} can be used in a real scenario.",
        "Compute a result using the principles of {concept}.",
    ],
    "L4": [
        "Analyze the role of {concept} and its trade-offs.",
        "Compare {concept} with an alternative approach.",
        "Differentiate between the components of {concept}.",
        "Examine how the parts of {concept} relate to one another.",
    ],
    "L5": [
        "Evaluate the effectiveness of {concept}.",
        "Justify the use of {concept} in a given situation.",
        "Critique the strengths and weaknesses of {concept}.",
        "Assess whether {concept} is suitable for a stated requirement.",
    ],
    "L6": [
        "Design a solution that uses {concept}.",
        "Develop an approach based on {concept} for a new problem.",
        "Propose an improved version of {concept} and justify it.",
        "Formulate a scheme that integrates {concept} with related ideas.",
    ],
}

# Words too generic to be good question subjects.
_STOPWORDS = set("""
the a an and or of to in on for with without is are was were be been being this that these those
it its as at by from into over under between within can will may should would could about
""".split())


def extract_text(data: bytes, filename: str) -> str:
    """Extract plain text from a PDF or DOCX byte payload."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _extract_pdf(data)
    if name.endswith(".docx"):
        return _extract_docx(data)
    # Fallback: treat as UTF-8 text
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_pdf(data: bytes) -> str:
    try:
        import fitz  # PyMuPDF
        text_parts = []
        with fitz.open(stream=data, filetype="pdf") as doc:
            for page in doc:
                text_parts.append(page.get_text())
        return "\n".join(text_parts)
    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        import docx  # python-docx
        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)
    except Exception as e:
        logger.error("DOCX extraction failed: %s", e)
        return ""


def _clean_sentences(text: str):
    """Split into reasonably-sized candidate sentences/clauses."""
    # Normalise whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Split on sentence boundaries
    raw = re.split(r"(?<=[.!?])\s+", text)
    sents = []
    for s in raw:
        s = s.strip()
        # keep sentences of a useful length (not headings, not paragraphs)
        wc = len(s.split())
        if 5 <= wc <= 40:
            sents.append(s)
    return sents


def _candidate_concepts(text: str, max_concepts: int = 40):
    """
    Pull candidate concept phrases: capitalised multi-word terms and frequent
    noun-like phrases. Crude but works offline without spaCy models loaded.
    """
    # Multi-word capitalised phrases (e.g. "Transport Layer", "Packet Switching")
    caps = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b", text)
    # Lowercase technical-ish terms by frequency
    words = re.findall(r"\b[a-z]{4,}\b", text.lower())
    freq = {}
    for w in words:
        if w in _STOPWORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    top_words = [w for w, _ in sorted(freq.items(), key=lambda kv: -kv[1])[:max_concepts]]

    concepts = []
    seen = set()
    for c in caps + top_words:
        c = re.sub(r"^(the|a|an)\s+", "", c.strip(), flags=re.IGNORECASE).strip()
        key = c.lower().strip()
        if key and key not in seen and key not in _STOPWORDS and len(key) >= 3:
            seen.add(key)
            concepts.append(c.strip())
        if len(concepts) >= max_concepts:
            break
    return concepts


def _rank_by_salience(concepts, sentences, embedder, top_k):
    """
    Rank concepts by how central they are to the document, using embeddings:
    a concept that is similar to many sentences is likely a core topic.
    Falls back to input order if the embedder is unavailable.
    """
    if not concepts:
        return []
    if embedder is None or not sentences:
        return concepts[:top_k]
    try:
        import numpy as np
        doc_emb = embedder.encode(sentences)
        doc_centroid = np.mean(doc_emb, axis=0)
        concept_emb = embedder.encode(concepts)
        # cosine similarity of each concept to the document centroid
        def cos(u, v):
            denom = (np.linalg.norm(u) * np.linalg.norm(v)) or 1.0
            return float(np.dot(u, v) / denom)
        scored = [(c, cos(concept_emb[i], doc_centroid)) for i, c in enumerate(concepts)]
        scored.sort(key=lambda kv: -kv[1])
        return [c for c, _ in scored[:top_k]]
    except Exception as e:
        logger.error("Salience ranking failed, falling back to order: %s", e)
        return concepts[:top_k]


def generate_questions(text, requested, embedder=None, avoid=None):
    """
    Build draft OR-group question PAIRS.

    `requested` is a list of dicts: {"co": "CO3", "rbtl": "L3", "count": 2, "marks": 5}
    where `count` is the number of OR PAIRS to generate for that CO. The caller
    (Node backend) ensures each requested rbtl is at or below that CO's ceiling.

    `avoid` is an optional iterable of normalized question texts already used for
    this course; the generator tries template/concept combinations that are NOT
    in this set, so questions don't repeat across papers until options run out.

    Each returned item is an OR pair whose two sides share the SAME co, rbtl and
    marks (differing only in wording, built from two different concepts).
    """
    sentences = _clean_sentences(text)
    concepts = _candidate_concepts(text)
    total_pairs = sum(int(r.get("count", 1)) for r in requested) or 1
    # Pull MORE concepts than strictly needed so we have alternatives to dodge
    # already-used questions.
    ranked = _rank_by_salience(concepts, sentences, embedder, top_k=max(total_pairs * 8, 24))

    if len(ranked) < 2:
        return []

    avoid_set = set(avoid or [])
    def norm(t):
        return " ".join(str(t).lower().split()).strip()

    # Build a candidate question for a concept at a given rbtl, choosing a
    # template whose text isn't in the avoid set if possible.
    def build(concept, rbtl, prefer_idx):
        templates = TEMPLATES.get(rbtl, TEMPLATES["L2"])
        order = list(range(len(templates)))
        order = order[prefer_idx % len(templates):] + order[:prefer_idx % len(templates)]
        fallback = None
        for ti in order:
            t = templates[ti].format(concept=concept)
            if fallback is None:
                fallback = t
            if norm(t) not in avoid_set:
                return t
        return fallback  # all templates used before; reuse least-bad

    pairs = []
    ci = 0
    for req in requested:
        co = req.get("co")
        rbtl = req.get("rbtl")
        marks = req.get("marks", 5)
        count = int(req.get("count", 1))
        for n in range(count):
            # Pick two concepts whose generated text isn't already used, scanning
            # forward through the ranked concepts.
            chosen = []
            scans = 0
            while len(chosen) < 2 and scans < len(ranked) * 2:
                cand = ranked[ci % len(ranked)]; ci += 1; scans += 1
                if cand not in chosen:
                    chosen.append(cand)
            concept_a = chosen[0]
            concept_b = chosen[1] if len(chosen) > 1 else chosen[0]
            text_a = build(concept_a, rbtl, 2 * n)
            text_b = build(concept_b, rbtl, 2 * n + 1)
            pairs.append({
                "co": co,
                "rbtl": rbtl,
                "marks": marks,
                "optionA": {"text": text_a, "sourceConcept": concept_a},
                "optionB": {"text": text_b, "sourceConcept": concept_b},
            })
    return pairs


def _strip_command_verb(question):
    """
    Remove leading Bloom's command phrasing so the embedding focuses on the
    concept. "Explain the concept of X." -> "X". Best-effort and conservative.
    """
    q = (question or "").strip()
    # Drop trailing instruction tails like "with a suitable example".
    q = re.sub(r"\b(with (a )?(suitable )?examples?|and its trade-offs|to solve a practical problem|with a worked example)\b.*$", "", q, flags=re.IGNORECASE)
    # Strip a leading command verb + filler ("Explain the concept of", "Describe how", "Define", ...)
    q = re.sub(r"^\s*(define|list|state|name|identify|explain|describe|summari[sz]e|illustrate|discuss|apply|demonstrate|show|compute|analy[sz]e|compare|contrast|differentiate|examine|evaluate|justify|critique|assess|design|develop|formulate|propose|create)\b", "", q, flags=re.IGNORECASE)
    q = re.sub(r"^\s*(the concept of|the role of|how|the use of|the main|that uses|a solution that uses)\b", "", q, flags=re.IGNORECASE)
    return q.strip(" .:-")


def draft_answer_from_notes(question_text, notes_text, marks=5, embedder=None):
    """
    Extractive draft answer: select the sentences from the notes most relevant
    to the question and return them as a draft. This is NOT generation — it pulls
    the most pertinent passages so the faculty has a starting point to edit.

    Length scales with marks (more marks -> more sentences). Works best for
    lower-Bloom's questions (define/explain) where the answer is present in the
    notes; for higher-Bloom's questions the faculty will largely rewrite it.

    Returns {"draft": str, "sentenceCount": int, "warning": str|None}.
    """
    sentences = _clean_sentences(notes_text)
    if not sentences:
        return {"draft": "", "sentenceCount": 0,
                "warning": "No usable text found in the notes for this module."}

    # How many sentences to include, scaled by marks (rough heuristic).
    if marks <= 3:
        n = 2
    elif marks <= 6:
        n = 4
    elif marks <= 10:
        n = 6
    else:
        n = 8
    n = min(n, len(sentences))

    ranked = sentences
    if embedder is not None:
        try:
            import numpy as np
            # Strip the Bloom's command verb from the question so the embedding
            # focuses on the CONCEPT, not the instruction ("Explain X" -> "X").
            focus = _strip_command_verb(question_text)
            q_emb = embedder.encode([focus or question_text])[0]
            s_emb = embedder.encode(sentences)

            def cos(u, v):
                denom = (np.linalg.norm(u) * np.linalg.norm(v)) or 1.0
                return float(np.dot(u, v) / denom)

            scored = [(i, cos(s_emb[i], q_emb)) for i in range(len(sentences))]
            scored.sort(key=lambda kv: -kv[1])
            # Take up to n, but only sentences clearing a relevance threshold so
            # we don't pad the draft with unrelated material.
            THRESH = 0.25
            chosen = [i for i, sc in scored[:n] if sc >= THRESH]
            if not chosen:  # nothing cleared the bar; keep the single best
                chosen = [scored[0][0]] if scored else []
            chosen_set = set(chosen)
            ranked = [s for i, s in enumerate(sentences) if i in chosen_set]
        except Exception as e:
            logger.error("Answer drafting ranking failed, using first sentences: %s", e)
            ranked = sentences[:n]
    else:
        ranked = sentences[:n]

    draft = " ".join(ranked).strip()
    warning = None
    if len(ranked) < 2:
        warning = "The notes contained little relevant content for this question — please write the answer manually."
    return {"draft": draft, "sentenceCount": len(ranked), "warning": warning}
