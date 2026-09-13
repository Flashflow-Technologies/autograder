"""
metrics.py — agreement and error metrics for EvalAI scoring analysis.

Implements the measures named in the paper's experimental protocol (§3.7):
  - Pearson and Spearman correlation
  - Mean Absolute Error (MAE) and RMSE
  - Quadratic Weighted Kappa (QWK) — the standard AES agreement metric
  - Accept-vs-adjust agreement rates (human oversight behaviour)
  - Cohort bias screening (mean deviation, flagged for human review)

Dependencies: numpy, scipy (for Spearman). QWK is implemented directly so the
result is transparent and does not depend on a specific library version.

All functions are pure and unit-testable. NONE of this fabricates data — it only
computes metrics over whatever real rows you pass in.
"""
from __future__ import annotations
import numpy as np


# ---------------------------------------------------------------------------
# Correlation and error
# ---------------------------------------------------------------------------
def pearson(a, b):
    a, b = _clean_pair(a, b)
    if len(a) < 2:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def spearman(a, b):
    a, b = _clean_pair(a, b)
    if len(a) < 2:
        return float("nan")
    # Rank-based Pearson (avoids a hard scipy dependency).
    ra, rb = _rankdata(a), _rankdata(b)
    return float(np.corrcoef(ra, rb)[0, 1])


def mae(a, b):
    a, b = _clean_pair(a, b)
    if len(a) == 0:
        return float("nan")
    return float(np.mean(np.abs(a - b)))


def rmse(a, b):
    a, b = _clean_pair(a, b)
    if len(a) == 0:
        return float("nan")
    return float(np.sqrt(np.mean((a - b) ** 2)))


# ---------------------------------------------------------------------------
# Quadratic Weighted Kappa (QWK)
# ---------------------------------------------------------------------------
def quadratic_weighted_kappa(a, b, min_rating=None, max_rating=None):
    """
    QWK between two integer-rating vectors a (e.g. AI) and b (e.g. human).
    Scores are rounded to integers for the rating matrix; if your marks are
    fractional, consider binning first. Returns a value in [-1, 1] (1 = perfect
    agreement, 0 = chance-level).
    """
    a, b = _clean_pair(a, b)
    if len(a) == 0:
        return float("nan")
    a = np.round(a).astype(int)
    b = np.round(b).astype(int)

    if min_rating is None:
        min_rating = int(min(a.min(), b.min()))
    if max_rating is None:
        max_rating = int(max(a.max(), b.max()))
    n = max_rating - min_rating + 1
    if n <= 1:
        # All scores identical -> perfect agreement by definition.
        return 1.0

    # Observed confusion matrix O.
    O = np.zeros((n, n))
    for x, y in zip(a, b):
        O[x - min_rating, y - min_rating] += 1

    # Weight matrix W (quadratic).
    W = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            W[i, j] = ((i - j) ** 2) / ((n - 1) ** 2)

    # Expected matrix E from marginals.
    act_hist = O.sum(axis=1)
    pred_hist = O.sum(axis=0)
    E = np.outer(act_hist, pred_hist) / O.sum()

    denom = (W * E).sum()
    if denom == 0:
        return 1.0
    return float(1.0 - (W * O).sum() / denom)


def qwk_label(kappa):
    """Landis & Koch interpretive band for kappa (for discussion text)."""
    if np.isnan(kappa):
        return "n/a"
    if kappa < 0.0:
        return "poor"
    if kappa <= 0.20:
        return "slight"
    if kappa <= 0.40:
        return "fair"
    if kappa <= 0.60:
        return "moderate"
    if kappa <= 0.80:
        return "substantial"
    return "almost perfect"


# ---------------------------------------------------------------------------
# Human oversight behaviour (accept vs adjust)
# ---------------------------------------------------------------------------
def agreement_rates(review_status):
    """
    Given a sequence of reviewStatus values, return accept/adjust proportions.
    'approved' and 'auto' = AI draft accepted; 'adjusted' = human changed it.
    'flagged'/'pending' are excluded (not resolved).
    """
    resolved = [s for s in review_status if s in ("approved", "auto", "adjusted")]
    total = len(resolved)
    if total == 0:
        return {"total": 0, "accepted_pct": float("nan"), "adjusted_pct": float("nan")}
    adjusted = sum(1 for s in resolved if s == "adjusted")
    accepted = total - adjusted
    return {
        "total": total,
        "accepted_pct": round(100 * accepted / total, 1),
        "adjusted_pct": round(100 * adjusted / total, 1),
    }


# ---------------------------------------------------------------------------
# Cohort bias screening (descriptive; flags for human review, not proof)
# ---------------------------------------------------------------------------
def cohort_bias(pcts_by_group, min_group=5, sd_threshold=0.5):
    """
    pcts_by_group: dict {group_name: [percentage_scores]}.
    Flags a group whose mean deviates > sd_threshold * overall_sd, with at least
    min_group members. This is a SCREENING heuristic for human review — NOT a
    statistical proof of bias.
    """
    all_pcts = [p for v in pcts_by_group.values() for p in v]
    if len(all_pcts) < 2:
        return {"overall_mean": float("nan"), "overall_sd": float("nan"), "groups": []}
    overall_mean = float(np.mean(all_pcts))
    overall_sd = float(np.std(all_pcts, ddof=1))

    groups = []
    for name, pcts in pcts_by_group.items():
        if not pcts:
            continue
        gmean = float(np.mean(pcts))
        delta = gmean - overall_mean
        flagged = overall_sd > 0 and abs(delta) > sd_threshold * overall_sd and len(pcts) >= min_group
        groups.append({
            "group": name, "n": len(pcts),
            "mean_pct": round(gmean, 1), "delta": round(delta, 1), "flagged": flagged,
        })
    groups.sort(key=lambda g: -g["n"])
    return {"overall_mean": round(overall_mean, 1), "overall_sd": round(overall_sd, 1), "groups": groups}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _clean_pair(a, b):
    """Drop pairs where either value is missing/NaN, return numpy arrays."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    mask = ~(np.isnan(a) | np.isnan(b))
    return a[mask], b[mask]


def _rankdata(x):
    """Average ranks (ties get mean rank), no scipy dependency."""
    x = np.asarray(x, dtype=float)
    order = x.argsort()
    ranks = np.empty(len(x), dtype=float)
    ranks[order] = np.arange(1, len(x) + 1)
    # average ties
    _, inv, counts = np.unique(x, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts))
    np.add.at(sums, inv, ranks)
    avg = sums / counts
    return avg[inv]
