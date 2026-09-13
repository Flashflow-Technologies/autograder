# AutoGrader — Automated Descriptive Answer Evaluation (MERN)

An automated system for evaluating **descriptive exam answers** using Natural
Language Processing and cosine similarity, built entirely on **free, open-source
tools**. NLP scoring, code execution, grammar checking, database, and queue all
run locally — no paid APIs.

This is a focused evaluation engine: it compares student answers against model
answers, assigns marks from semantic similarity, routes low-confidence and
borderline answers to a human reviewer, and shows the evidence behind every
mark (similarity score, confidence, matched keywords).

## Objectives

- Reduce the time and effort of manual evaluation by automating grading and
  producing results quickly.
- Improve grading consistency and minimize examiner bias through standardized,
  objective scoring criteria.
- Provide transparent, explainable feedback by showing similarity scores,
  confidence levels, and the reasons for the marks awarded.

## Scope

- Automates evaluation of descriptive answers using NLP and cosine similarity.
- Compares student answers with model answers and assigns marks from semantic
  similarity.
- Human-in-the-Loop review for low-confidence and borderline answers.
- Explainable grading: similarity scores and confidence levels are shown.
- Reduces manual checking, making evaluation faster and more consistent so every
  student is treated the same way.
- Usable in colleges, universities, online learning platforms, and competitive
  examination systems.

## How grading works

1. Faculty create an exam and build a question paper with a model answer (and
   optional keywords) for each question.
2. Students take the exam and submit typed answers (programming questions are
   executed against test cases).
3. The scoring engine compares each answer to its model answer using semantic
   (cosine) similarity plus keyword and quality signals, producing a score and
   a confidence level.
4. Answers below a confidence threshold, or near a grade boundary, are routed to
   the review queue for a human to confirm or adjust.
5. Results show students the marks with the explaining evidence.

## Roles

- Admin — manage users, departments, and exams; system settings.
- Faculty — author exams and model answers, review low-confidence answers,
  publish results.
- Student — take exams, view explainable results.

## Tech stack

Same as the platform it derives from: MERN (MongoDB, Express, React, Node) with
a Python/FastAPI NLP service, Docker for local orchestration, and open-source
scoring (sentence embeddings / cosine similarity), all self-hostable.

## Running

    docker compose up --build
