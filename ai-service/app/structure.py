"""
structure.py — Rung 1 structural analysis for descriptive answers.

Lightweight, dependency-free (pure Python + regex) structural features that
distinguish an *organised explanation* from a *keyword dump* or unstructured
text. Deliberately NOT a full syntactic parser — no spaCy/nltk — to keep the AI
service lean, fast, and self-hostable.

Produces a structure_score in [0, 1] plus a breakdown so the result stays
explainable (consistent with the human-in-the-loop / transparency philosophy).

The features:
  1. Sentence formation   — are there real sentences (not one run-on / fragments)?
  2. Idea development      — enough distinct content across sentences.
  3. Discourse connectives — typed (causal / contrastive / additive / sequential),
                             rewarding reasoning structure, not just their count.
  4. Referential cohesion  — do later sentences reuse earlier content words
                             (ideas connect) rather than restating disjoint terms?

These reinforce the keyword-stuffing mitigation from a second angle: a stuffed
answer has no connectives and no cohesion, so it scores low here too.
"""
from __future__ import annotations
import re

# Connectives grouped by rhetorical function. Causal + sequential signal
# explanation/reasoning; contrastive signals analysis; additive is weakest.
CONNECTIVES = {
    "causal": ["because", "therefore", "thus", "hence", "consequently", "so that",
               "since", "as a result", "due to", "owing to", "this leads to", "results in"],
    "contrastive": ["however", "whereas", "although", "though", "but", "on the other hand",
                    "in contrast", "conversely", "nevertheless", "while", "unlike"],
    "sequential": ["first", "second", "third", "next", "then", "finally", "after",
                   "before", "subsequently", "initially", "lastly", "step"],
    "additive": ["moreover", "furthermore", "in addition", "also", "additionally",
                 "besides", "as well as"],
}

# Very common words that shouldn't count as "content" for cohesion.
STOPWORDS = set("""a an the of to in on at for and or but is are was were be been being
this that these those it its with as by from into their his her our your my we you they
he she i can will would should could may might must not no do does did has have had if
then than so such which who whom whose what when where why how all any some each every
one two three which then also very more most much many few will shall""".split())


def _split_sentences(text: str):
    # Split on sentence-ending punctuation followed by space/EOL. Falls back to
    # newline splitting if no punctuation (common in terse answers).
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) <= 1 and "\n" in text:
        parts = [p.strip() for p in text.split("\n") if p.strip()]
    return parts


def _content_words(sentence: str):
    words = re.findall(r"[a-zA-Z]+", sentence.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def structure_features(answer: str):
    """Return (score in [0,1], breakdown dict)."""
    text = (answer or "").strip()
    if not text:
        return 0.0, {"reason": "empty"}

    sentences = _split_sentences(text)
    words = re.findall(r"[a-zA-Z]+", text.lower())
    n_words = len(words)
    n_sent = len(sentences)

    # --- 1. Sentence formation ---
    # Reward having multiple sentences of reasonable (not runaway) length.
    avg_len = (n_words / n_sent) if n_sent else 0
    if n_sent >= 2 and 5 <= avg_len <= 40:
        sentence_score = 1.0
    elif n_sent == 1 and 5 <= avg_len <= 40:
        sentence_score = 0.6           # single well-formed sentence — ok for short answers
    elif avg_len > 40:
        sentence_score = 0.4           # likely a run-on
    else:
        sentence_score = 0.3           # fragments / too terse

    # --- 2. Idea development ---
    # A structured answer develops ideas across multiple sentences, each carrying
    # a few content words in context. A keyword dump has high unique-word density
    # but little sentence structure — so we measure *developed sentences* (>=3
    # content words) relative to what the length warrants, and only give partial
    # credit for raw unique-content density. This stops a keyword list from
    # scoring high just because its words are all distinct.
    content = _content_words(text)
    unique_content = set(content)
    dev_ratio = (len(unique_content) / n_words) if n_words else 0
    density_component = min(dev_ratio / 0.35, 1.0)

    developed_sents = sum(1 for s in sentences if len(_content_words(s)) >= 3)
    expected_sents = max(1, n_words // 25)   # ~1 developed idea unit per 25 words
    structure_component = min(developed_sents / max(expected_sents, 1), 1.0)
    # A single "sentence" that is really a word list gets little development credit.
    if n_sent <= 1 and n_words > 20:
        structure_component = min(structure_component, 0.4)

    # Blend: structure matters more than raw density for detecting dumps.
    idea_score = 0.65 * structure_component + 0.35 * density_component

    # --- 3. Typed discourse connectives ---
    text_low = " " + text.lower() + " "
    type_hits = {}
    for ctype, words_list in CONNECTIVES.items():
        type_hits[ctype] = sum(1 for c in words_list if f" {c} " in text_low or text_low.count(c) > 0 and " " in c and c in text_low)
    # Reward *variety of function*, weighting reasoning connectives highest.
    weighted = (
        min(type_hits["causal"], 3) * 0.40
        + min(type_hits["sequential"], 3) * 0.25
        + min(type_hits["contrastive"], 3) * 0.25
        + min(type_hits["additive"], 3) * 0.10
    )
    connective_score = min(weighted / 1.0, 1.0)
    # Short answers shouldn't be forced to use connectives; scale expectation by length.
    if n_words < 25:
        connective_score = max(connective_score, 0.6)

    # --- 4. Referential cohesion ---
    # Fraction of consecutive sentence pairs that share a content word (ideas
    # carry forward). Only meaningful with >=2 sentences.
    if n_sent >= 2:
        linked = 0
        prev = set(_content_words(sentences[0]))
        for s in sentences[1:]:
            cur = set(_content_words(s))
            if prev & cur:
                linked += 1
            prev = cur
        cohesion_score = linked / (n_sent - 1)
    else:
        cohesion_score = 0.5   # neutral for single-sentence answers

    # --- Composite (weights favour sentence formation + idea development, the
    # most reliable signals; connectives + cohesion refine) ---
    score = (
        0.30 * sentence_score
        + 0.30 * idea_score
        + 0.20 * connective_score
        + 0.20 * cohesion_score
    )
    score = round(max(0.0, min(1.0, score)), 3)

    breakdown = {
        "sentences": n_sent,
        "avg_sentence_len": round(avg_len, 1),
        "unique_content_ratio": round(dev_ratio, 3),
        "connective_types": {k: v for k, v in type_hits.items() if v},
        "cohesion": round(cohesion_score, 2),
        "components": {
            "sentence_formation": round(sentence_score, 2),
            "idea_development": round(idea_score, 2),
            "connectives": round(connective_score, 2),
            "cohesion": round(cohesion_score, 2),
        },
    }
    return score, breakdown
