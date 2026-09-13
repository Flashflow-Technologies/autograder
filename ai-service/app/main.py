"""
AI microservice for the OBE exam evaluation system.

Uses only free, local, open-source tools — no paid APIs:
  - sentence-transformers (all-MiniLM-L6-v2) for cosine similarity
  - NLTK for tokenisation / stemming / keyword matching / lexical diversity
  - language_tool_python for grammar
  - pytesseract (Tesseract) / TrOCR for OCR

Endpoints:
  POST /score  -> score one answer against a scheme entry
  POST /ocr    -> OCR a scanned answer image
"""
import logging
import math
import re
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Request, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .structure import structure_features

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.FileHandler("ai-service.log"), logging.StreamHandler()],
)
logger = logging.getLogger("ai-service")

app = FastAPI(title="Exam Eval AI Service", version="1.0.0")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request and any unhandled error with timing + path."""
    import time
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:  # never let an error escape unlogged
        logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})
    ms = int((time.time() - start) * 1000)
    if response.status_code >= 500:
        logger.error("%s %s -> %s (%dms)", request.method, request.url.path, response.status_code, ms)
    elif ms > 5000:
        logger.warning("Slow %s %s -> %s (%dms)", request.method, request.url.path, response.status_code, ms)
    return response

# ---- Lazy-loaded singletons (heavy models load once) ----
_embedder = None
_grammar_tool = None


def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformer model all-MiniLM-L6-v2")
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


def get_grammar_tool():
    global _grammar_tool
    if _grammar_tool is None:
        import language_tool_python
        logger.info("Loading LanguageTool (en-US)")
        _grammar_tool = language_tool_python.LanguageTool("en-US")
    return _grammar_tool


# ---- Request / response models ----
class ScoreRequest(BaseModel):
    answer_text: str
    model_answer: str
    mandatory_keywords: List[str] = []
    bonus_keywords: List[str] = []
    weights: dict  # {cosine, keywords, style, grammar} summing to 100
    rbtl: str
    max_marks: float
    expected_length: str = "short"


MIN_WORDS = {"brief": 15, "short": 50, "medium": 120, "long": 200}


def cosine_similarity(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    try:
        emb = get_embedder().encode([a, b])
        va, vb = emb[0], emb[1]
        dot = float(sum(x * y for x, y in zip(va, vb)))
        na = math.sqrt(sum(x * x for x in va))
        nb = math.sqrt(sum(y * y for y in vb))
        return max(0.0, min(1.0, dot / (na * nb))) if na and nb else 0.0
    except Exception as e:  # safe fallback to TF-IDF-ish overlap
        logger.error("Embedding failed, falling back: %s", e)
        return jaccard(a, b)


def jaccard(a: str, b: str) -> float:
    sa, sb = set(a.lower().split()), set(b.lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def stem(word: str) -> str:
    # Lightweight stemmer to avoid hard NLTK dependency at runtime
    w = word.lower()
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def keyword_score(answer: str, mandatory: List[str], bonus: List[str]):
    tokens = {stem(t) for t in re.findall(r"[a-zA-Z]+", answer.lower())}
    text_lower = answer.lower()
    all_words = re.findall(r"[a-zA-Z]+", answer.lower())

    def found(kw: str) -> bool:
        # phrase match OR stemmed single-word match
        if " " in kw:
            return kw.lower() in text_lower
        return stem(kw) in tokens

    found_m = [k for k in mandatory if found(k)]
    found_b = [k for k in bonus if found(k)]
    missing_m = [k for k in mandatory if k not in found_m]

    m_ratio = (len(found_m) / len(mandatory)) if mandatory else 1.0
    b_ratio = (len(found_b) / len(bonus)) if bonus else 0.0
    score = min(m_ratio * 0.8 + b_ratio * 0.2, 1.0)

    # --- Keyword-stuffing mitigation ---
    # A genuine answer embeds keywords in explanatory prose. A stuffed answer is
    # mostly keywords (and their repetitions) with little connective text. We
    # estimate a "stuffing factor" and dampen the keyword score when the answer
    # looks like a keyword list rather than an explanation.
    stuffing_penalty = _stuffing_factor(all_words, mandatory + bonus)
    score = score * stuffing_penalty
    return score, found_m + found_b, missing_m


def _stuffing_factor(all_words: List[str], keywords: List[str]) -> float:
    """Return a multiplier in [0.4, 1.0]. 1.0 = natural prose; lower = the answer
    is dominated by keyword tokens and/or heavy repetition (stuffing)."""
    if not all_words:
        return 1.0
    total = len(all_words)

    # 1) Very short answers that only contain keywords are suspicious.
    kw_word_set = set()
    for kw in keywords:
        for w in kw.lower().split():
            kw_word_set.add(stem(w))
    stemmed = [stem(w) for w in all_words]
    kw_hits = sum(1 for w in stemmed if w in kw_word_set)
    kw_density = kw_hits / total  # fraction of the answer that is keyword tokens

    # 2) Repetition: low unique-word ratio means the same tokens repeated.
    unique_ratio = len(set(stemmed)) / total

    penalty = 1.0
    # High keyword density (keyword salad) -> dampen. Natural prose is usually
    # well under 0.35 keyword-token density.
    if kw_density > 0.5:
        penalty *= 0.5
    elif kw_density > 0.35:
        penalty *= 0.75
    # Heavy repetition (e.g. "stack stack stack") -> dampen.
    if unique_ratio < 0.4:
        penalty *= 0.6
    elif unique_ratio < 0.6:
        penalty *= 0.85
    return max(0.4, penalty)


def style_score(answer: str, rbtl: str) -> float:
    words = re.findall(r"[a-zA-Z]+", answer.lower())
    if not words:
        return 0.0
    lexical_diversity = len(set(words)) / len(words)
    connectors = ["therefore", "however", "whereas", "consequently", "because", "thus", "hence", "moreover"]
    has_connectors = sum(1 for c in connectors if c in answer.lower())
    # higher RBTL rewards discourse connectors more
    weight = 0.5 if rbtl in ("L4", "L5", "L6") else 0.25
    coherence = min(has_connectors / 3.0, 1.0)
    return max(0.0, min(1.0, (1 - weight) * lexical_diversity + weight * coherence))


def grammar_score(answer: str) -> float:
    if not answer.strip():
        return 0.0
    try:
        matches = get_grammar_tool().check(answer)
        words = max(len(answer.split()), 1)
        error_rate = min(len(matches) / words, 1.0)
        return round(1 - error_rate, 3)
    except Exception as e:
        logger.error("Grammar check failed, neutral score: %s", e)
        return 0.7  # neutral fallback rather than penalising on tooling failure


@app.post("/score")
def score(req: ScoreRequest):
    logger.info("Scoring answer for RBTL=%s max_marks=%s", req.rbtl, req.max_marks)
    # Each component is computed defensively: if one fails, it scores 0 for
    # that component only, and the others still contribute. A single failing
    # piece must never collapse the whole answer to "unavailable".
    def safe(fn, label, default=0.0):
        try:
            return fn()
        except Exception as e:
            logger.error("Component '%s' failed: %s", label, e, exc_info=True)
            return default

    cos = safe(lambda: cosine_similarity(req.answer_text, req.model_answer), "cosine")
    kw_result = safe(lambda: keyword_score(req.answer_text, req.mandatory_keywords, req.bonus_keywords),
                     "keywords", default=(0.0, [], list(req.mandatory_keywords or [])))
    kw, found, missing = kw_result
    # "style" is now the Rung 1 structural score (sentence formation, idea
    # development, typed connectives, cohesion), blended with the older
    # lexical-diversity signal for stability. Falls back safely on error.
    sty_struct = safe(lambda: structure_features(req.answer_text), "structure", default=(0.0, {}))
    struct_score, struct_breakdown = sty_struct
    sty_legacy = safe(lambda: style_score(req.answer_text, req.rbtl), "style")
    sty = round(0.7 * struct_score + 0.3 * sty_legacy, 3)
    gra = safe(lambda: grammar_score(req.answer_text), "grammar", default=0.7)

    # Guard weights: default any missing key, and normalise so a bad scheme
    # (weights not summing to 100) can't distort or zero the score.
    w = req.weights or {}
    cw = float(w.get("cosine", 35))
    kwt = float(w.get("keywords", 35))
    swt = float(w.get("style", 20))
    gwt = float(w.get("grammar", 10))
    wsum = cw + kwt + swt + gwt or 100.0

    composite = (
        (cw / wsum) * cos
        + (kwt / wsum) * kw
        + (swt / wsum) * sty
        + (gwt / wsum) * gra
    )

    # length adequacy penalty
    word_count = len((req.answer_text or "").split())
    min_words = MIN_WORDS.get(req.expected_length, 50)
    length_factor = min(word_count / min_words, 1.0) if min_words else 1.0
    adjusted = composite * length_factor

    raw_score = round(adjusted * req.max_marks, 1)
    score_val = min(raw_score, req.max_marks)  # cap
    confidence = round(min(0.5 + cos * 0.3 + kw * 0.2, 1.0), 2)

    feedback = build_feedback(cos, kw, sty, found, missing, req.rbtl, length_factor)

    # #4 Highlighted answer spans: per-sentence similarity to the model answer,
    # so the UI can show WHICH parts of the answer matched well. Defensive: if it
    # fails, we just omit spans (scoring is unaffected).
    spans = safe(lambda: sentence_spans(req.answer_text, req.model_answer), "spans", default=[])

    return {
        "components": {"cosine": round(cos, 3), "keywords": round(kw, 3), "style": round(sty, 3), "grammar": round(gra, 3)},
        "score": score_val,
        "confidence": confidence,
        "foundKeywords": found,
        "missingKeywords": missing,
        "feedback": feedback,
        "spans": spans,
        "structure": struct_breakdown,  # Rung 1 breakdown, for transparency/debugging
    }


def sentence_spans(answer: str, model: str):
    """Split the student's answer into sentences and score each against the
    model answer (max cosine over model sentences). Returns a list of
    {text, score} so the UI can highlight strong/weak spans. No new model —
    reuses the same embedder."""
    import re
    if not answer or not model:
        return []
    ans_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", answer) if s.strip()]
    mod_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", model) if s.strip()]
    if not ans_sents or not mod_sents:
        return []
    emb = get_embedder()
    import numpy as np
    a_emb = emb.encode(ans_sents)
    m_emb = emb.encode(mod_sents)
    out = []
    for i, av in enumerate(a_emb):
        # best cosine of this answer sentence vs any model sentence
        sims = [float(np.dot(av, mv) / ((np.linalg.norm(av) * np.linalg.norm(mv)) or 1.0)) for mv in m_emb]
        best = max(sims) if sims else 0.0
        out.append({"text": ans_sents[i][:300], "score": round(max(0.0, best), 3)})
    return out


def build_feedback(cos, kw, sty, found, missing, rbtl, length_factor) -> str:
    parts = []
    if cos >= 0.8:
        parts.append("Your answer closely matches the expected response.")
    elif cos >= 0.6:
        parts.append("Your answer covers the main idea but diverges from the model in places.")
    else:
        parts.append("Your answer differs substantially from the expected response.")
    if missing:
        parts.append(f"Missing key terms: {', '.join(missing)}.")
    if rbtl in ("L5", "L6") and sty < 0.6:
        parts.append("For evaluative/creative questions, use more analytical structure and connecting reasoning.")
    if length_factor < 1.0:
        parts.append("The answer is shorter than expected for the marks allocated.")
    return " ".join(parts)


class CoMatchRequest(BaseModel):
    question: str
    cos: list  # [{ "coId": "CO1", "statement": "..." }, ...]


@app.post("/match-cos")
def match_cos(req: CoMatchRequest):
    """Score a question against each CO statement by semantic similarity.
    Returns per-CO scores (0..1), sorted high-to-low. Phase B uses this to
    SUGGEST likely COs — faculty always confirm. No auto-assignment."""
    results = []
    for co in (req.cos or []):
        coid = co.get("coId")
        stmt = co.get("statement") or ""
        if not coid or not stmt.strip():
            continue
        score = safe(lambda: cosine_similarity(req.question, stmt), "match-cos", default=0.0)
        results.append({"coId": coid, "score": round(score, 3)})
    results.sort(key=lambda r: r["score"], reverse=True)
    return {"matches": results}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    try:
        import io
        from PIL import Image
        import pytesseract
        image = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(image)
        logger.info("OCR extracted %d chars from %s", len(text), file.filename)
        return {"text": text.strip()}
    except Exception as e:
        logger.error("OCR failed for %s: %s", file.filename, e)
        return {"text": "", "error": str(e)}


@app.on_event("startup")
def warmup():
    """Pre-load the heavy models at boot so no scoring request pays the
    cold-start cost (which was causing client-side timeouts/aborts)."""
    logger.info("Warming up models at startup…")
    try:
        get_embedder().encode(["warmup"])
        logger.info("Embedding model ready")
    except Exception as e:
        logger.error("Embedder warmup failed: %s", e)
    try:
        get_grammar_tool().check("This is a warmup sentence.")
        logger.info("Grammar engine ready")
    except Exception as e:
        logger.error("Grammar warmup failed: %s", e)
    logger.info("Warmup complete — service ready to score")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-org-document")
async def parse_org_document(file: UploadFile = File(...)):
    """Extract text from an uploaded institution document (PDF/DOCX) and detect
    Vision/Mission/PO/PSO/PEO/WK/Academic-Objectives sections by heading.

    Returns SUGGESTED sections for admin review — nothing is applied. Detection
    is a best-effort heuristic; the admin confirms/corrects before saving."""
    from . import generator as gen
    from .org_parser import detect_sections

    data = await file.read()
    text = gen.extract_text(data, file.filename or "")
    if not text or len(text.strip()) < 30:
        return JSONResponse(content={
            "sections": {}, "unmatched": [],
            "warning": "Could not extract enough text. If this is a scanned PDF, upload a text-based document instead.",
        })
    result = detect_sections(text)
    return result


@app.post("/generate")
async def generate(
    file: UploadFile = File(...),
    spec: str = Form(...),
    avoid: str = Form(None),
):
    """
    Generate draft questions from an uploaded notes file (PDF/DOCX).

    `spec` is a JSON string: a list of
        {"co": "CO3", "rbtl": "L3", "count": 2, "marks": 5}
    The Node backend builds this spec and guarantees each rbtl is at or below the
    CO's ceiling before calling here. Returns {"questions": [...], "warning"?}.
    """
    import json
    from . import generator as gen

    try:
        requested = json.loads(spec)
        if not isinstance(requested, list) or not requested:
            return JSONResponse(status_code=400, content={"error": "spec must be a non-empty JSON array"})
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"invalid spec JSON: {e}"})

    data = await file.read()
    text = gen.extract_text(data, file.filename or "")
    if not text or len(text.strip()) < 50:
        return JSONResponse(content={
            "pairs": [],
            "warning": "Could not extract enough text from the file. If it is a scanned PDF, the notes generator needs a text-based document (OCR of full documents is not supported here).",
        })

    try:
        embedder = get_embedder()
    except Exception:
        embedder = None  # generation still works without salience ranking

    avoid_list = []
    if avoid:
        try:
            avoid_list = json.loads(avoid)
            if not isinstance(avoid_list, list):
                avoid_list = []
        except Exception:
            avoid_list = []
    pairs = gen.generate_questions(text, requested, embedder=embedder, avoid=avoid_list)
    logger.info("Generated %d draft OR pairs from %s", len(pairs), file.filename)
    return {
        "pairs": pairs,
        "extractedText": text,
        "warning": None if pairs else "Not enough distinct concepts were found to build OR pairs (each pair needs two concepts).",
    }


@app.post("/draft-answer")
async def draft_answer(payload: dict):
    """
    Extractive draft answer for one question, from already-extracted notes text.
    Body: {"question": str, "notesText": str, "marks": int}
    Returns {"draft", "sentenceCount", "warning"}.
    """
    from . import generator as gen
    question = (payload or {}).get("question", "")
    notes_text = (payload or {}).get("notesText", "")
    marks = int((payload or {}).get("marks", 5) or 5)
    if not question or not notes_text:
        return JSONResponse(status_code=400, content={"error": "question and notesText are required"})
    try:
        embedder = get_embedder()
    except Exception:
        embedder = None
    return gen.draft_answer_from_notes(question, notes_text, marks=marks, embedder=embedder)
