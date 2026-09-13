# EvalAI Research Analysis Toolkit

Turns a per-answer score export from EvalAI into the tables and figures for the
research paper's Results section (§4), following the experimental protocol (§3.7).

## What it computes

| Paper item | Metric | File |
|---|---|---|
| Exp 1 | AI-vs-human agreement: Pearson, Spearman, MAE, RMSE, **QWK** | `table1_agreement_overall.csv`, `table1_agreement_by_rbtl.csv`, `fig3_ai_vs_human_scatter.png` |
| Exp 2 | Component–human correlation | `table2_component_corr.csv`, `fig4_component_corr.png` |
| Exp 3 | Human oversight: accept-vs-adjust by Bloom level | `table3_agreement_by_rbtl.csv`, `fig5_agreement_by_rbtl.png` |
| Exp 5 | Cohort bias screening (flags for human review) | `table5_bias.csv` |
| — | Confidence vs. scoring error | `fig6_confidence_vs_error.png` |
| — | Human-readable roll-up | `summary.txt` |

## Step 1 — export your data from EvalAI

The system now has a research export endpoint that emits exactly the schema the
toolkit expects (one row per scored sub-answer):

```
GET /research/export                 # all published exams
GET /research/export?examId=<id>     # one exam
GET /research/export?includeProgramming=true   # include code questions too
```
(admin/faculty auth required). Save the response as `scores.csv`.

**Columns produced:** `ai_score, final_score, max_marks, rbtl, co, cohort,
review_status, confidence, comp_cosine, comp_keywords, comp_style, comp_grammar`.

> `cohort` comes from each student's `cohort` field — if you don't populate that,
> the bias screening simply treats everyone as one group (still valid, just no
> cross-cohort comparison).

## Step 2 — install dependencies

```bash
cd analysis
pip install -r requirements.txt
```

## Step 3 — run

```bash
python run_analysis.py --input scores.csv --outdir results/
```

Outputs land in `results/`. Open `summary.txt` first, then the CSV tables and PNG
figures. Drop the figures straight into the paper (they're 150 dpi).

## Trying it without real data

Run with no `--input` to generate a **clearly-watermarked synthetic demo** so you
can see the whole pipeline work:

```bash
python run_analysis.py --outdir demo_results/
```

Every figure is stamped "SYNTHETIC DEMO" and `summary.txt` is marked NOT REAL. It
also writes `SYNTHETIC_input_example.csv` so you can see the exact input schema.

## Honest notes

- **QWK rounds marks to integers** to build the rating matrix (standard for QWK).
  If your marks are fractional and you want finer resolution, bin them first.
- **These scripts compute; they do not fabricate.** On real data they report
  exactly what your data shows — including unflattering results. That is the point:
  a paper's credibility rests on real numbers.
- **The bias screen is descriptive, not inferential.** A flag means "a cohort's
  mean differs enough to look at," not "bias exists." State it that way in the paper.
- **Small samples:** with few answers at L5/L6, per-level metrics will be noisy.
  Report the n alongside every metric (the tables do this) and don't over-interpret
  thin cells.
- `metrics.py` has no plotting dependency and can be imported on its own if you want
  to compute metrics in a notebook.
