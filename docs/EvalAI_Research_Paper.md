# A Transparent and Accountable Human-in-the-Loop Framework for Automated Descriptive and Programming Answer Evaluation in Outcome-Based Education

**Authors:** [Author 1]¹, [Author 2]², [Author 3]¹
¹[Department, Canara Engineering College, Mangalore, India]
²[Cardiff Metropolitan University, UK]
*Corresponding author: [email]*

---

> **NOTE TO AUTHOR (remove before submission).** This is a full working draft. The
> Introduction, Related Work, and Methodology are complete and faithful to the
> system you built. The **Results & Discussion** section is provided as a
> *structured template with clearly-marked placeholders* — the numbers, tables,
> and graphs must be produced by running the experiments described in §3.7 on your
> system. **Do not submit placeholder results as if they were real.** Core citations in the reference list have been verified against their original
> sources; a few remaining in-text references (clearly noted "add citation") are
> ones you should supply from your final source set. Text in square brackets is for
> you to fill.

---

## Abstract

Automated Paper Evaluation Systems (APES) promise to relieve the growing grading
burden in large-cohort engineering education, yet their adoption is constrained by
three persistent weaknesses: opacity of scoring, limited accountability, and the
risk of unfair or unchallengeable decisions. This paper presents **EvalAI**, a
deployed, open-source examination-evaluation system for Outcome-Based Education
(OBE) that operationalizes a Transparent, Accountable, and Responsible AI (TAR-AI)
philosophy under a strict *"AI assists, humans decide"* principle. EvalAI combines
a multi-factor descriptive scorer (semantic similarity via Sentence-BERT, keyword
coverage, structural and grammatical analysis) with sandboxed programming-answer
evaluation and automated Course-Outcome/Program-Outcome (CO/PO) attainment
computation. Crucially, every AI-generated score is a *reviewable draft* that no
grade is finalized without human approval, and the system surfaces per-answer
score-contribution breakdowns, concept-coverage feedback, confidence indicators,
and sentence-level match highlighting to students. For accountability, EvalAI
implements model/rubric version stamping, a tamper-evident hash-chained audit log,
score-change provenance, cohort-level bias-monitoring analytics, and AI-versus-human
agreement reporting. We describe the system architecture and evaluation methodology
in detail and provide a reproducible experimental protocol for measuring scoring
validity, transparency utility, and oversight behaviour. [State one-line summary of
key finding once data is collected.]

**Keywords:** Automated Essay Scoring, Outcome-Based Education, Explainable AI,
Responsible AI, Human-in-the-Loop, Educational Assessment, Semantic Similarity

---

## 1. Introduction

### 1.1 Background and Motivation

Engineering education worldwide has shifted toward Outcome-Based Education (OBE),
in which the quality of a programme is measured not by content delivered but by
learning outcomes demonstrably attained by students. In accreditation regimes such
as those governed by the National Board of Accreditation (NBA) in India, this
requires assessment data to be systematically mapped to Course Outcomes (COs) and
Program Outcomes (POs), and attainment levels to be computed and reported for every
examination cycle. The clerical burden this imposes on faculty—setting structured
question papers, grading large volumes of descriptive answer scripts, and computing
attainment—is substantial and growing as cohort sizes increase.

Automated Paper Evaluation Systems (APES), drawing on advances in Natural Language
Processing (NLP), have emerged as a means to reduce this burden. Modern approaches
use word and sentence embeddings to capture semantic features of student responses,
moving beyond earlier surface-feature methods [6]. However,
the literature consistently identifies that deep-learning-based scoring, while
accurate, suffers from a critical limitation: an inability to explain *which
features and patterns* produced a given score, which is precisely what is needed to
interpret scores and give constructive feedback [2]. Reports on APES performance have themselves been
criticized for a lack of transparency in methodology and outcome reporting [5].

This opacity has three practical consequences in an educational setting. First,
**pedagogical**: students receive a number but no actionable explanation, so the
assessment loses its formative value. Second, **accountability**: when a grade is
disputed, there is often no reproducible record of how it was produced or who is
responsible for it. Third, **fairness**: without monitoring, systematic disparities
across student cohorts can go undetected. These are not merely technical gaps; in a
high-stakes examination context they are barriers to trust and, therefore, to
adoption.

### 1.2 The TAR-AI Perspective

Recent work has framed the requirements for trustworthy automated evaluation within
Cyber-Physical Educational Systems in terms of **Transparent, Accountable, and
Responsible AI (TAR-AI)** [7]. That framework is largely conceptual, describing what an ideal system
*should* provide. The contribution of the present work is to move from concept to a
**deployed, reproducible implementation**, and to report its architecture, design
decisions, and an evaluation protocol grounded in a real OBE examination workflow.

### 1.3 Design Philosophy: "AI Assists, Humans Decide"

The central design commitment of EvalAI is that the AI never *finalizes* a grade.
Every automatically produced score is treated as a draft that a faculty member
reviews and either approves or overrides, with high-cognitive-level questions
(Bloom's L5–L6) and low-confidence scores *mandatorily* routed to human review.
This inverts the usual framing of automation: the objective is not to remove the
human, but to make the human faster and better-informed while preserving their
authority and responsibility. This philosophy shapes every feature described in
this paper, and distinguishes EvalAI from fully-automated scoring systems.

### 1.4 Contributions

This paper makes the following contributions:

1. **A deployed OBE examination-evaluation system** integrating multi-factor
   descriptive scoring, sandboxed programming evaluation, and automated CO/PO/PSO
   attainment in a single open-source, self-hostable platform.
2. **An interpretable-by-design scoring pipeline** whose component structure
   (semantic, keyword, structural, grammatical) yields explainability directly,
   without post-hoc attribution methods.
3. **A concrete realization of transparency** for students: per-answer contribution
   breakdowns, concept-coverage feedback, confidence indicators, rule-based
   natural-language feedback, and sentence-level match highlighting.
4. **A concrete realization of accountability**: model/rubric version stamping, a
   tamper-evident hash-chained audit log, score-change provenance, cohort
   bias-monitoring, and AI-versus-human agreement reporting.
5. **A reproducible evaluation methodology** for assessing scoring validity,
   transparency utility, and human-oversight behaviour on real examination data.

### 1.5 Paper Organization

Section 2 surveys related work. Section 3 details the system architecture,
scoring methodology, and the transparency and accountability mechanisms, together
with the experimental protocol. Section 4 presents the expected results structure
and discusses interpretation. Section 5 outlines future scope, and Section 6
concludes.

---

## 2. Literature Survey

### 2.1 Evolution of Automated Essay and Answer Scoring

Automated essay scoring (AES) has progressed through three broad phases. Early
systems relied on **hand-crafted surface features**—essay length, vocabulary
richness, term frequencies, and readability indices—coupled with statistical models
such as regression, latent semantic analysis, and cosine-similarity techniques.
These feature-based approaches are valued for explainable and adaptable scoring
criteria, because the features are explicitly stated, but they capture implicit
semantic content poorly [3].

The second phase introduced **neural and word-embedding models**, representing
essays as vectors from which semantic features are extracted, and later
**transformer-based models** that achieved strong performance on benchmark datasets
such as ASAP [4]. The third and
current phase increasingly explores **large language models** for holistic scoring
and feedback, though these raise concerns about hallucination, reliability, and
bias against non-native writers [9], [10].

### 2.2 Semantic Similarity for Answer Evaluation

A key enabler for content-based scoring is the ability to measure semantic
similarity between a student answer and a reference answer. **Sentence-BERT
(SBERT)** modifies a pretrained BERT network using siamese and triplet network
structures to derive semantically meaningful sentence embeddings that can be
compared with cosine similarity, reducing the cost of finding similar sentence
pairs from tens of hours with vanilla BERT to seconds while maintaining accuracy
[Reimers and Gurevych, 2019, EMNLP-IJCNLP, pp. 3982–3992]. This makes SBERT
particularly well-suited to comparing free-text answers against model answers at
examination scale, and it is the semantic backbone of the system described here
(specifically the compact `all-MiniLM-L6-v2` variant, chosen for CPU-friendly,
dependency-light deployment).

### 2.3 The Transparency and Interpretability Gap

Across surveys, the recurring critique of accurate deep-learning AES is its
**black-box nature**. Deep models identify complex patterns and predict scores
end-to-end, but cannot readily explain the specific patterns used—information
essential for interpreting scores and offering constructive feedback [2]. Reporting practices themselves have been found to lack the
transparency needed for fair comparison, prompting calls for proper protocols to
describe methodologies and report outcomes [5]. Hybrid approaches that combine
expert/rubric models with deep learning have been proposed specifically to improve
flexibility and transparency of scoring standards [a recent hybrid expert-model/deep-learning AES study — add citation]. EvalAI aligns with this hybrid,
interpretable-by-design direction: rather than reconstructing an explanation after
the fact, its scoring is *decomposed* into named components whose individual
contributions are shown directly.

### 2.4 Human-in-the-Loop and Rubric-Based Scoring

Rubric-specific training and rubric-aware scoring have been shown to capture
attributes that prompt-specific models overlook [a rubric-specific training study — add citation]. The need
for **initial machine scoring followed by secondary human evaluation** is
recognized as an objective requirement in large-scale review settings [recent hybrid AES literature — add citation]. EvalAI adopts this stance as a first-class design principle rather
than an add-on: machine scoring is always provisional and human review is
structurally required for the cases where automated confidence is lowest.

### 2.5 Fairness, Accountability, and Responsible AI in Assessment

Beyond accuracy and explainability, responsible deployment requires monitoring for
**bias** and maintaining **accountability**. Studies have documented potential bias
in automated scoring, including against non-native English speakers [a study documenting scoring bias against non-native writers — add citation]. The TAR-AI framing [7]
argues for auditability, human oversight, and fairness monitoring as integral
components. However, few deployed systems operationalize these as concrete
software features. EvalAI's contribution here is practical: tamper-evident audit
logging, provenance, and descriptive bias-monitoring analytics that flag
disparities for human investigation without claiming to prove bias.

### 2.6 Research Gap

The literature establishes that (i) semantic-embedding methods enable content-aware
scoring, (ii) accuracy without transparency limits educational usefulness and
trust, and (iii) responsible deployment demands human oversight, accountability,
and fairness monitoring—yet these are seldom combined in a single, deployed,
reproducible OBE system that also handles programming answers and attainment
computation. EvalAI addresses this gap.

---

## 3. Methodology

This section describes the system in sufficient detail for reproduction. §3.1–3.2
cover architecture and data model; §3.3 the descriptive scoring pipeline; §3.4
programming evaluation; §3.5 attainment; §3.6 the transparency and accountability
mechanisms; and §3.7 the experimental protocol used to generate results.

### 3.1 System Architecture

EvalAI is a containerized, service-oriented application deployed via Docker Compose
with nine services: a MongoDB datastore; a Redis instance backing a BullMQ job
queue; an Express.js REST API (Node.js); a Python FastAPI microservice hosting the
NLP/ML models; a background worker for asynchronous scoring; a React single-page
client served through nginx; and a sandboxed code-execution engine (Judge0) with
its own PostgreSQL and Redis dependencies. The separation of the AI microservice
from the application server allows the scoring model to be scaled, replaced, or
audited independently, and permits graceful degradation—if the AI service is
unavailable, submissions are still recorded and flagged for manual review rather
than lost.

*[Figure 1: System architecture diagram — reproduce from the project report.]*

### 3.2 Data Model and Examination Structure

Question papers follow a VTU-style module structure (Module → internal-choice
OR-pair → sub-questions). Each sub-question carries a Course Outcome (CO), a Bloom's
Revised Taxonomy Level (RBTL, L1–L6), and a maximum-marks value. A per-examination
marks scheme defines, for each sub-question, the model answer, the mandatory and
bonus keywords, and the component weights used by the scorer. The system enforces a
**Bloom's-ceiling constraint**: a question's cognitive level may not exceed the
Bloom's level implied by the CO it assesses.

### 3.3 Descriptive Answer Scoring Pipeline

For a student answer *A* evaluated against a model answer *M* with scheme entry
parameters, the scorer computes four components, each normalized to [0, 1]:

**(a) Semantic similarity (`cosine`).** Both *A* and *M* are encoded with a
Sentence-BERT model (`all-MiniLM-L6-v2`), and the cosine similarity of the resulting
embeddings is taken:

  cosine(A, M) = (v_A · v_M) / (‖v_A‖ ‖v_M‖)

where v_A, v_M are the sentence embeddings of *A* and *M*.

**(b) Keyword coverage (`keywords`).** The proportion of mandatory concept keywords
present in *A*, with bonus keywords contributing additional credit. The sets of
*found* and *missing* keywords are retained for feedback.

**(c) Structural score (`style`).** A measure of organization and coherence
appropriate to the question's RBTL (higher-order questions expect more analytical
structure).

**(d) Grammatical quality (`grammar`).** A readability/grammar measure of *A*.

These are combined into a composite using scheme-defined weights
(w_cos, w_kw, w_sty, w_gra), which are normalized so that a mis-specified scheme
cannot distort the result:

  composite = (w_cos·cosine + w_kw·keywords + w_sty·style + w_gra·grammar) / Σw

A **length-adequacy factor** penalizes answers shorter than the expected length for
the marks allocated:

  length_factor = min(word_count / min_words, 1.0)
  adjusted = composite × length_factor

The raw mark is `adjusted × max_marks`, capped at `max_marks` and stored as a whole
number. A **confidence** value is derived as

  confidence = min(0.5 + 0.3·cosine + 0.2·keywords, 1.0)

**Review routing.** A sub-score is routed to mandatory human review if its RBTL is
L5 or L6, or if `confidence < 0.5`; otherwise it is provisionally auto-approved but
remains fully editable by faculty. *No result is published while any sub-score
remains in a pending or flagged state.*

*[Figure 2: Scoring pipeline data-flow — reproduce from project report.]*

### 3.4 Programming Answer Evaluation

Programming sub-questions (Python, Java, C, C++) are evaluated by compiling and
executing the student's source against faculty-authored test cases inside a
sandboxed engine with per-execution CPU, memory, and wall-time limits and no
network access. The score combines **correctness** (weighted proportion of passing
test cases, including hidden cases), **structural/style** indicators, and
**complexity**, per a configurable rubric. As with descriptive scoring, results are
faculty-reviewable, and execution failures degrade gracefully to a flagged score
rather than a lost submission. *(A microVM-isolated execution backend is also
supported as a safer alternative for multi-tenant deployment.)*

### 3.5 CO/PO/PSO Attainment Computation

On result publication, EvalAI computes attainment using the NBA level convention.
CO attainment is derived from the proportion of students meeting a target mark
threshold, mapped to levels 1–3. PO/PSO attainment is computed as the CO–PO
matrix-weighted aggregation of CO attainment across all course questions,
aggregated department-wide for the HoD view. *[State exact threshold values used in
your deployment.]*

### 3.6 Transparency and Accountability Mechanisms

**Transparency (student-facing).**
- *Score-contribution breakdown:* each reviewed answer displays its four component
  scores as percentages ("meaning match, key concepts covered, structure, grammar").
- *Concept coverage:* the count and identity of key concepts covered versus missed.
- *Natural-language feedback:* deterministic, rule-based strengths / weaknesses /
  suggestions generated from the component scores (no LLM, ensuring consistency and
  explainability).
- *Sentence-level highlighting:* each sentence of the answer is scored by its
  maximum cosine similarity to the model-answer sentences and colour-coded, giving a
  transparent "why this score" view.
- *Confidence indicator:* the model's confidence is shown as an honest band, with a
  note that all scores were faculty-reviewed.

**Accountability.**
- *Version stamping:* every score records the scoring model identifier, service and
  application versions, scheme version, and timestamp, enabling reproduction.
- *Tamper-evident audit log:* every faculty action (approve, adjust, flag, OR
  selection, appeal resolution) is written to an append-only log in which each
  entry is hash-chained to its predecessor (entry hash = SHA-256 of the entry's
  canonical content concatenated with the previous entry's hash). Any alteration or
  deletion of a past entry breaks the chain, which a verifier detects and localizes
  to the first broken entry.
- *Score-change provenance:* where a human overrides an AI draft, the student is
  shown the AI-suggested mark, the final mark, the responsible reviewer, and the
  reason.
- *Bias-monitoring analytics:* published-score distributions are compared across
  student cohorts; a cohort whose mean deviates beyond a threshold (|Δ| > 0.5 SD of
  the overall distribution, minimum group size 5) is flagged **for human review**.
  This is explicitly a screening heuristic, not a determination of bias.
- *AI-versus-human agreement reporting:* the rate at which faculty accept versus
  adjust AI drafts is tracked overall and by Bloom's level, surfacing where
  automated scoring is least reliable.

### 3.7 Experimental Protocol (to generate results)

The following protocol produces the data for Section 4. It is designed so results
are reproducible and honestly reported.

**Dataset.** [Describe the examinations used: number of courses, students,
questions, and the mix of descriptive vs programming items. State whether data is
from live examinations or a controlled study, and the ethics/consent basis.]

**Experiment 1 — Scoring validity (agreement with human graders).**
1. Select N answer scripts spanning multiple COs and Bloom levels.
2. Have EvalAI produce draft scores; independently have M expert faculty grade the
   same answers blind to the AI score.
3. Report agreement between AI draft and human mark using: Pearson/Spearman
   correlation, Mean Absolute Error (MAE), and Quadratic Weighted Kappa (QWK)—the
   standard AES agreement metric.
4. Stratify results by Bloom's level and by question type.
*[Table 1: Agreement metrics overall and by RBTL. Figure 3: AI vs human scatter
plot with y=x reference line.]*

**Experiment 2 — Component behaviour.**
1. For the same set, record the four component scores.
2. Analyze the correlation of each component with the final human mark to show which
   components carry signal at which Bloom levels.
*[Table 2: Component–human correlation by RBTL. Figure 4: component distributions.]*

**Experiment 3 — Human oversight behaviour (AI-vs-human agreement).**
1. From live review logs, compute the accept-vs-adjust rate overall and by Bloom's
   level, and the mean adjustment magnitude.
2. Interpret where human intervention concentrates.
*[Table 3 / Figure 5: accept vs adjust by RBTL, from the built-in agreement report.]*

**Experiment 4 — Transparency utility (user study).**
1. Present students with results that include the transparency features versus a
   plain-mark baseline.
2. Collect Likert-scale ratings on perceived fairness, understanding, and
   actionability, plus qualitative feedback.
3. Report distributions and any significant differences.
*[Table 4 / Figure 6: survey results. State sample size and instrument.]*

**Experiment 5 — Accountability verification.**
1. Demonstrate the tamper-evident log: verify an intact chain, then programmatically
   alter one historical entry and show the verifier localizes the break.
2. Report the bias-monitoring output across cohorts for a real cohort set,
   emphasizing its role as a screening tool.
*[Table 5: audit-verification result; bias-monitor summary.]*

**Experiment 6 — Performance and scalability.**
1. Measure per-answer scoring latency (descriptive and programming), throughput
   under the background-queue, and the additional latency introduced by
   sentence-level highlighting.
*[Table 6: latency/throughput. State hardware.]*

---

## 4. Results and Discussion (Expected Structure)

> **This section is a template.** Populate each subsection with the data produced by
> the §3.7 protocol. Suggested interpretive framing is given, but do not state any
> numeric claim until measured.

### 4.1 Scoring Validity

Report Experiment 1 here. *Expected/interpretive framing:* semantic-similarity-based
scoring typically agrees well with human grading on lower-order (L1–L3) knowledge
and comprehension questions, with agreement decreasing at higher Bloom's levels
(L5–L6) where reasoning and creativity dominate—precisely the levels EvalAI routes
to mandatory human review. If observed, this pattern *supports the design decision*
to require human oversight at higher levels. Present Table 1 and Figure 3. Compare
QWK values against published AES baselines on comparable tasks (compare against reported baselines once selected).

### 4.2 Component Contribution Analysis

Report Experiment 2. *Interpretive framing:* discuss which components (semantic vs
keyword vs structural) correlate most with human marks, and how this validates the
interpretable-by-design claim—i.e., the components are not only explainable but
*meaningful*. Present Table 2 and Figure 4.

### 4.3 Human Oversight Behaviour

Report Experiment 3 using the system's built-in agreement report. *Interpretive
framing:* a higher adjustment rate at L5–L6 would be concrete evidence that the
human-in-the-loop design concentrates effort where the AI is weakest and provides
genuine oversight rather than rubber-stamping. Present Table 3 / Figure 5.

### 4.4 Transparency Utility

Report Experiment 4. *Interpretive framing:* discuss whether the transparency
features improved students' perceived fairness and understanding relative to a plain
mark, and which feature (breakdown, concept coverage, highlighting, confidence) was
rated most useful. Present Table 4 / Figure 6. Connect back to the literature's
identification of the pedagogical cost of opacity.

### 4.5 Accountability Demonstration

Report Experiment 5. Present the tamper-evidence demonstration (intact chain
verified; an altered entry localized) and the bias-monitoring output, reiterating
that a flag prompts human investigation and is not a determination of unfairness.

### 4.6 Performance and Scalability

Report Experiment 6. *Interpretive framing:* discuss whether latency and throughput
are acceptable for examination-scale use, and quantify the cost of the
sentence-level highlighting feature so adopters can make an informed trade-off.

### 4.7 Threats to Validity and Limitations

Discuss honestly: (i) semantic scoring cannot fully assess higher-order reasoning,
argument flow, or novel correct answers not anticipated by the model answer—hence
the human-in-the-loop requirement; (ii) the bias monitor is a descriptive screening
heuristic, not a causal or statistically conclusive fairness test; (iii) rule-based
feedback is consistent but less nuanced than expert commentary; (iv) results depend
on the quality of faculty-authored model answers and keyword sets; (v) any user
study is subject to sampling and context limitations. State the specific limits of
your dataset.

---

## 5. Future Scope

Several directions would extend this work:

1. **Higher-order reasoning assessment.** Incorporate discourse-coherence and
   argument-structure analysis, or knowledge-graph-based concept linking, to better
   evaluate L5–L6 answers that current semantic matching handles conservatively.

2. **Advanced explainability.** Add token- or phrase-level attribution (e.g.
   attention-based or SHAP-style methods) to complement the current component and
   sentence-level transparency, while preserving interpretability.

3. **Fairness beyond monitoring.** Move from descriptive bias screening toward
   validated fairness diagnostics and, where appropriate, bias-mitigation
   techniques—carefully, given the risks of naive debiasing in high-stakes grading.

4. **Adaptive, data-driven weighting.** Learn the component weights (w_cos, w_kw,
   w_sty, w_gra) per question type from accumulated human-adjustment data, closing
   the loop between oversight and scoring.

5. **LMS and CPS integration.** Integrate with Learning Management Systems and
   explore edge/real-time continuous-assessment scenarios envisioned by the
   Cyber-Physical Educational Systems literature.

6. **Multilingual and cross-institution studies.** Evaluate on regional languages
   and across institutions to test generalization and data-residency-compliant
   deployment.

7. **Longitudinal impact.** Study whether transparent feedback measurably improves
   student learning outcomes over multiple examination cycles, not merely perceived
   fairness.

---

## 6. Conclusion

This paper presented EvalAI, a deployed, open-source, OBE examination-evaluation
system that operationalizes a Transparent, Accountable, and Responsible AI
philosophy under a strict "AI assists, humans decide" principle. Unlike
fully-automated black-box scorers, EvalAI combines an interpretable-by-design
multi-factor scoring pipeline, sandboxed programming evaluation, and automated
attainment computation with concrete transparency mechanisms (component breakdowns,
concept coverage, confidence, sentence-level highlighting) and accountability
mechanisms (version stamping, tamper-evident audit logging, provenance, bias
monitoring, and human-agreement reporting). The system directly addresses the
transparency, accountability, and fairness gaps repeatedly identified in the
automated-scoring literature, and it does so within free, self-hostable
infrastructure suitable for resource-constrained institutions. [Add one or two
sentences summarizing your empirical findings once collected.] By keeping faculty
authority central while making their work faster and better-informed, EvalAI offers
a practical path toward trustworthy automated assessment in outcome-based
engineering education.

---

## References

> **Verification status.** References [1]–[6], [9], [10] have been verified against
> the original sources (author list, venue, volume/pages, and DOI confirmed) and are
> ready to use. Entries marked **[TO COMPLETE]** are ones you must fill from the
> primary source: your own framework paper [7], and standard references [8], [11],
> [12] that depend on your final text. Adjust formatting to your target journal's
> style (this list uses an IEEE-like format).

[1] N. Reimers and I. Gurevych, "Sentence-BERT: Sentence embeddings using Siamese
BERT-networks," in *Proc. 2019 Conf. on Empirical Methods in Natural Language
Processing and the 9th Int. Joint Conf. on Natural Language Processing
(EMNLP-IJCNLP)*, Hong Kong, China, 2019, pp. 3982–3992. doi: 10.18653/v1/D19-1410.

[2] H. Misgna, B.-W. On, I. Lee, and G. S. Choi, "A survey on deep learning-based
automated essay scoring and feedback generation," *Artificial Intelligence Review*,
vol. 58, art. no. 36, 2025. doi: 10.1007/s10462-024-11017-5.

[3] D. Ramesh and S. K. Sanampudi, "An automated essay scoring systems: A
systematic literature review," *Artificial Intelligence Review*, vol. 55, no. 3,
pp. 2495–2527, 2022. doi: 10.1007/s10462-021-10068-2.

[4] M. Uto, "A review of deep-neural automated essay scoring models,"
*Behaviormetrika*, vol. 48, no. 2, pp. 459–484, 2021. doi: 10.1007/s41237-021-00142-y.

[5] V. S. Kumar and D. Boulanger, "Automated essay scoring and the deep learning
black box: How are rubric scores determined?," *International Journal of Artificial
Intelligence in Education*, vol. 30, no. 4, pp. 538–584, 2020. doi:
10.1007/s40593-020-00211-5.

[6] Z. Ke and V. Ng, "Automated essay scoring: A survey of the state of the art,"
in *Proc. 28th Int. Joint Conf. on Artificial Intelligence (IJCAI)*, 2019, pp.
6300–6308. doi: 10.24963/ijcai.2019/879.

[7] [TO COMPLETE — your framework paper] [Author(s)], "A conceptual framework for
Transparent, Accountable, and Responsible AI (TAR-AI) compliant automated paper
evaluation within cyber-physical educational systems," [venue], [year]. *(Fill in
authors, venue, and year from the source manuscript this work implements.)*

[8] [TO COMPLETE — Bloom's Revised Taxonomy] L. W. Anderson and D. R. Krathwohl,
Eds., *A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's
Taxonomy of Educational Objectives*. New York, NY: Longman, 2001. *(Verify edition
details for your citation style.)*

[9] A. Mizumoto and M. Eguchi, "Exploring the potential of using an AI language
model for automated essay scoring," *Research Methods in Applied Linguistics*, vol.
2, no. 2, art. no. 100050, 2023. doi: 10.1016/j.rmal.2023.100050.

[10] T. P. Tate, J. Steiss, D. Bailey, S. Graham, Y. Moon, D. Ritchie, W. Tseng,
and M. Warschauer, "Can AI provide useful holistic essay scoring?," *Computers and
Education: Artificial Intelligence*, vol. 7, art. no. 100255, 2024. doi:
10.1016/j.caeai.2024.100255.

[11] [TO COMPLETE — Judge0] H. Došilović and I. Mekterović, "Robust and scalable
online code execution system (Judge0)," in *Proc. 43rd Int. Convention on
Information, Communication and Electronic Technology (MIPRO)*, 2020. *(Verify exact
title/pages for your citation style.)*

[12] [TO COMPLETE — add any further sources your final text cites, e.g. the NBA/OBE
accreditation manual and the specific Sentence-Transformers `all-MiniLM-L6-v2`
model card.]
