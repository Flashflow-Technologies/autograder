"""
run_analysis.py — end-to-end analysis for the EvalAI research paper.

Reads a CSV export of per-answer scores from EvalAI and produces the tables and
figures for the paper's Results section (§4), following the protocol in §3.7.

USAGE
    python run_analysis.py --input scores.csv --outdir results/

INPUT CSV — one row per scored sub-answer. Required columns:
    ai_score       float   the AI draft mark (subScore.aiScore)
    final_score    float   the human-approved mark (subScore.finalScore)
    max_marks      float   maximum marks for the question
    rbtl           str     Bloom level, e.g. L1..L6
    review_status  str     auto|approved|adjusted|flagged|pending
Optional (enable extra analyses if present):
    co             str     course outcome id
    cohort         str     student cohort/section (for bias screening)
    comp_cosine, comp_keywords, comp_style, comp_grammar   float 0..1 components
    confidence     float   0..1

If no --input is given, a clearly-labelled SYNTHETIC demo dataset is generated so
you can see the pipeline run. Demo output is watermarked "SYNTHETIC DEMO" — never
report it as real results.

OUTPUTS (in --outdir)
    table1_agreement_overall.csv / by_rbtl
    table2_component_corr.csv
    table3_agreement_by_rbtl.csv
    table5_bias.csv
    fig3_ai_vs_human_scatter.png
    fig4_component_corr.png
    fig5_agreement_by_rbtl.png
    fig6_confidence_vs_error.png
    summary.txt
"""
from __future__ import annotations
import argparse, os, sys, csv
import numpy as np
import metrics as M

try:
    import matplotlib
    matplotlib.use("Agg")  # headless
    import matplotlib.pyplot as plt
    HAVE_PLT = True
except Exception:
    HAVE_PLT = False


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_csv(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def prep(rows):
    """Normalize rows into typed dicts and derive percentage scores."""
    out = []
    for r in rows:
        mm = to_float(r.get("max_marks"))
        ai = to_float(r.get("ai_score"))
        fin = to_float(r.get("final_score"))
        rec = {
            "ai": ai, "final": fin, "max": mm,
            "rbtl": (r.get("rbtl") or "NA").strip(),
            "co": (r.get("co") or "NA").strip(),
            "cohort": (r.get("cohort") or "NA").strip(),
            "review_status": (r.get("review_status") or "").strip(),
            "confidence": to_float(r.get("confidence")),
            "comp": {
                "cosine": to_float(r.get("comp_cosine")),
                "keywords": to_float(r.get("comp_keywords")),
                "style": to_float(r.get("comp_style")),
                "grammar": to_float(r.get("comp_grammar")),
            },
        }
        rec["ai_pct"] = 100 * ai / mm if mm else float("nan")
        rec["final_pct"] = 100 * fin / mm if mm else float("nan")
        out.append(rec)
    return out


# ---------------------------------------------------------------------------
# Experiments
# ---------------------------------------------------------------------------
def exp1_agreement(data, outdir, demo):
    ai = [d["ai"] for d in data]
    hu = [d["final"] for d in data]
    overall = {
        "n": len(data),
        "pearson": round(M.pearson(ai, hu), 3),
        "spearman": round(M.spearman(ai, hu), 3),
        "mae": round(M.mae(ai, hu), 3),
        "rmse": round(M.rmse(ai, hu), 3),
        "qwk": round(M.quadratic_weighted_kappa(ai, hu), 3),
    }
    overall["qwk_label"] = M.qwk_label(overall["qwk"])
    _write_csv(os.path.join(outdir, "table1_agreement_overall.csv"),
               [overall], list(overall.keys()))

    # by RBTL
    by = []
    for lvl in sorted(set(d["rbtl"] for d in data)):
        sub = [d for d in data if d["rbtl"] == lvl]
        a = [d["ai"] for d in sub]; h = [d["final"] for d in sub]
        by.append({"rbtl": lvl, "n": len(sub),
                   "pearson": round(M.pearson(a, h), 3),
                   "mae": round(M.mae(a, h), 3),
                   "qwk": round(M.quadratic_weighted_kappa(a, h), 3)})
    _write_csv(os.path.join(outdir, "table1_agreement_by_rbtl.csv"),
               by, ["rbtl", "n", "pearson", "mae", "qwk"])

    # Figure 3: AI vs human scatter
    if HAVE_PLT:
        _scatter_ai_human(ai, hu, os.path.join(outdir, "fig3_ai_vs_human_scatter.png"), demo)
    return overall, by


def exp2_components(data, outdir, demo):
    """Correlate each component with the human mark percentage."""
    comps = ["cosine", "keywords", "style", "grammar"]
    human = [d["final_pct"] for d in data]
    rows = []
    corrs = {}
    for c in comps:
        vals = [d["comp"][c] for d in data]
        # only meaningful if the component column was populated
        if np.all(np.isnan(np.asarray(vals, dtype=float))):
            corrs[c] = float("nan")
            rows.append({"component": c, "pearson_with_human": "n/a (no data)"})
        else:
            r = M.pearson(vals, human)
            corrs[c] = r
            rows.append({"component": c, "pearson_with_human": round(r, 3)})
    _write_csv(os.path.join(outdir, "table2_component_corr.csv"),
               rows, ["component", "pearson_with_human"])
    if HAVE_PLT and any(not np.isnan(v) for v in corrs.values()):
        _bar_components(corrs, os.path.join(outdir, "fig4_component_corr.png"), demo)
    return rows


def exp3_oversight(data, outdir, demo):
    """Accept vs adjust overall and by RBTL."""
    overall = M.agreement_rates([d["review_status"] for d in data])
    by = []
    for lvl in sorted(set(d["rbtl"] for d in data)):
        sub = [d for d in data if d["rbtl"] == lvl]
        rates = M.agreement_rates([d["review_status"] for d in sub])
        by.append({"rbtl": lvl, **rates})
    _write_csv(os.path.join(outdir, "table3_agreement_by_rbtl.csv"),
               by, ["rbtl", "total", "accepted_pct", "adjusted_pct"])
    if HAVE_PLT:
        _bar_agreement(by, os.path.join(outdir, "fig5_agreement_by_rbtl.png"), demo)
    return overall, by


def exp5_bias(data, outdir):
    groups = {}
    for d in data:
        if not np.isnan(d["final_pct"]):
            groups.setdefault(d["cohort"], []).append(d["final_pct"])
    result = M.cohort_bias(groups)
    _write_csv(os.path.join(outdir, "table5_bias.csv"),
               result["groups"], ["group", "n", "mean_pct", "delta", "flagged"])
    return result


def fig_confidence_error(data, outdir, demo):
    """Figure 6: does higher AI confidence mean smaller AI-human gap?"""
    conf = [d["confidence"] for d in data]
    err = [abs(d["ai"] - d["final"]) for d in data]
    if HAVE_PLT and not np.all(np.isnan(np.asarray(conf, dtype=float))):
        c, e = M._clean_pair(conf, err)
        if len(c):
            plt.figure(figsize=(5, 4))
            plt.scatter(c, e, alpha=0.5, s=18)
            plt.xlabel("AI confidence"); plt.ylabel("|AI - human| (marks)")
            plt.title("Confidence vs. scoring error")
            _watermark(demo)
            plt.tight_layout()
            plt.savefig(os.path.join(outdir, "fig6_confidence_vs_error.png"), dpi=150)
            plt.close()


# ---------------------------------------------------------------------------
# Plot helpers
# ---------------------------------------------------------------------------
def _scatter_ai_human(ai, hu, path, demo):
    a, h = M._clean_pair(ai, hu)
    plt.figure(figsize=(5, 5))
    plt.scatter(a, h, alpha=0.5, s=18)
    lo = min(a.min(), h.min()); hi = max(a.max(), h.max())
    plt.plot([lo, hi], [lo, hi], "r--", linewidth=1, label="y = x (perfect agreement)")
    plt.xlabel("AI draft mark"); plt.ylabel("Human final mark")
    plt.title("AI vs. human marks")
    plt.legend(fontsize=8)
    _watermark(demo)
    plt.tight_layout(); plt.savefig(path, dpi=150); plt.close()


def _bar_components(corrs, path, demo):
    keys = [k for k in corrs if not np.isnan(corrs[k])]
    vals = [corrs[k] for k in keys]
    plt.figure(figsize=(5, 4))
    plt.bar(keys, vals)
    plt.ylabel("Pearson r with human mark"); plt.title("Component–human correlation")
    plt.ylim(-1, 1); plt.axhline(0, color="k", linewidth=0.6)
    _watermark(demo)
    plt.tight_layout(); plt.savefig(path, dpi=150); plt.close()


def _bar_agreement(by, path, demo):
    levels = [b["rbtl"] for b in by]
    acc = [b["accepted_pct"] if not _isnan(b["accepted_pct"]) else 0 for b in by]
    adj = [b["adjusted_pct"] if not _isnan(b["adjusted_pct"]) else 0 for b in by]
    x = np.arange(len(levels))
    plt.figure(figsize=(6, 4))
    plt.bar(x, acc, label="Accepted", color="#1f9d55")
    plt.bar(x, adj, bottom=acc, label="Adjusted", color="#d97706")
    plt.xticks(x, levels); plt.ylabel("% of reviewed answers")
    plt.title("AI-draft acceptance vs. adjustment, by Bloom level")
    plt.legend(fontsize=8)
    _watermark(demo)
    plt.tight_layout(); plt.savefig(path, dpi=150); plt.close()


def _watermark(demo):
    if demo:
        plt.gcf().text(0.5, 0.5, "SYNTHETIC DEMO", fontsize=30, color="grey",
                       alpha=0.25, ha="center", va="center", rotation=30)


# ---------------------------------------------------------------------------
# utilities
# ---------------------------------------------------------------------------
def _isnan(v):
    try:
        return np.isnan(v)
    except TypeError:
        return False


def _write_csv(path, rows, fieldnames):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def make_synthetic(n=300, seed=42):
    """Clearly-labelled synthetic data so the pipeline is demonstrable.
    Models a plausible pattern: AI agrees well at low Bloom levels, less so at
    L5/L6; adjustments concentrate at higher levels. NOT REAL DATA."""
    rng = np.random.default_rng(seed)
    levels = ["L1", "L2", "L3", "L4", "L5", "L6"]
    # higher level -> more AI-human divergence
    noise_by_level = {"L1": 0.6, "L2": 0.8, "L3": 1.1, "L4": 1.6, "L5": 2.4, "L6": 3.0}
    adj_prob = {"L1": 0.08, "L2": 0.10, "L3": 0.18, "L4": 0.30, "L5": 0.48, "L6": 0.55}
    cohorts = ["A", "B", "C"]
    rows = []
    for _ in range(n):
        lvl = rng.choice(levels, p=[0.22, 0.22, 0.20, 0.16, 0.12, 0.08])
        mm = rng.choice([5, 8, 10])
        true_q = rng.uniform(0.3, 1.0)  # latent quality
        human = np.clip(round(true_q * mm), 0, mm)
        ai = np.clip(round(true_q * mm + rng.normal(0, noise_by_level[lvl])), 0, mm)
        adjusted = rng.random() < adj_prob[lvl]
        status = "adjusted" if adjusted else rng.choice(["approved", "auto"])
        final = human if adjusted else ai  # if accepted, final == ai draft
        conf = float(np.clip(0.5 + 0.3 * true_q + rng.normal(0, 0.08), 0, 1))
        cohort = rng.choice(cohorts, p=[0.4, 0.35, 0.25])
        # give cohort C a slight downward shift to exercise the bias screen
        if cohort == "C":
            final = max(0, final - rng.integers(0, 2))
        rows.append({
            "ai_score": ai, "final_score": final, "max_marks": mm, "rbtl": lvl,
            "co": f"CO{rng.integers(1,5)}", "cohort": cohort, "review_status": status,
            "confidence": round(conf, 2),
            "comp_cosine": round(np.clip(true_q + rng.normal(0, 0.1), 0, 1), 3),
            "comp_keywords": round(np.clip(true_q + rng.normal(0, 0.15), 0, 1), 3),
            "comp_style": round(np.clip(0.5 + rng.normal(0, 0.2), 0, 1), 3),
            "comp_grammar": round(np.clip(0.7 + rng.normal(0, 0.15), 0, 1), 3),
        })
    return rows


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="EvalAI research analysis")
    ap.add_argument("--input", help="CSV export of per-answer scores")
    ap.add_argument("--outdir", default="results", help="output directory")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    demo = args.input is None
    if demo:
        print("No --input given: generating SYNTHETIC DEMO data (do NOT report as real).")
        rows = make_synthetic()
        # also save the demo input so the user sees the expected schema
        _write_csv(os.path.join(args.outdir, "SYNTHETIC_input_example.csv"), rows, list(rows[0].keys()))
    else:
        rows = load_csv(args.input)
        print(f"Loaded {len(rows)} rows from {args.input}")

    data = prep(rows)
    if not data:
        print("No usable rows.", file=sys.stderr); sys.exit(1)

    overall, by_rbtl = exp1_agreement(data, args.outdir, demo)
    comp_rows = exp2_components(data, args.outdir, demo)
    ov_over, ov_by = exp3_oversight(data, args.outdir, demo)
    bias = exp5_bias(data, args.outdir)
    fig_confidence_error(data, args.outdir, demo)

    # summary.txt
    with open(os.path.join(args.outdir, "summary.txt"), "w") as f:
        if demo:
            f.write("*** SYNTHETIC DEMO OUTPUT — NOT REAL RESULTS ***\n\n")
        f.write("EXPERIMENT 1 — AI vs human agreement (overall)\n")
        for k, v in overall.items():
            f.write(f"  {k}: {v}\n")
        f.write("\nBy Bloom level:\n")
        for b in by_rbtl:
            f.write(f"  {b['rbtl']}: n={b['n']} pearson={b['pearson']} mae={b['mae']} qwk={b['qwk']}\n")
        f.write("\nEXPERIMENT 3 — Human oversight (overall)\n")
        f.write(f"  {ov_over}\n")
        f.write("\nEXPERIMENT 5 — Cohort screening\n")
        f.write(f"  overall_mean={bias['overall_mean']} sd={bias['overall_sd']}\n")
        for g in bias["groups"]:
            f.write(f"  {g['group']}: n={g['n']} mean={g['mean_pct']} delta={g['delta']} flagged={g['flagged']}\n")
        f.write("\nNOTE: bias flags indicate cohorts worth a human look — NOT proof of bias.\n")

    print(f"Done. Tables and figures written to {args.outdir}/")
    if not HAVE_PLT:
        print("NOTE: matplotlib not available — figures were skipped (tables still produced).")


if __name__ == "__main__":
    main()
