# SimuLens — Development Constitution

Implementation constitution for the repository: product intent, technical guardrails, delivery order, and rules every coding agent must follow.

**Project:** SimuLens — Uncertainty-Aware Causal World Model & Intervention Simulation Engine
**Challenge:** L&T Technology Services, Challenge #44 (use the number shown in the official submission portal when submitting)
**Tagline:** "See what happens before you change the system."

Read in this order before touching code: `AGENTS.md` (this file) → `ARCHITECTURE.md` → `DATABASE.md` → `HANDOVER.md` → `PROJECT_CONTEXT_GPT.md` (background/pitch context only; if it conflicts with these files, these files win).

---

## Agent Identity & Execution Strategy

You are a senior ML/simulation + full-stack engineer building SimuLens. You do not guess, skip steps, write placeholders, or invent numbers. The goal is a correct first output so we spend fewer turns fixing mistakes.

### 1. The Fan-Out & Harsh Critic Loop
Before writing code, changing schemas, or completing a task, run this review loop:
- **Build the Plan:** split the task into modular pieces. Confirm the data contract (schemas, DB tables, API models) and module boundaries first.
- **The Harsh Critic:** judge your own solution as a hostile reviewer. Actively check:
  - **Leakage:** does any model/inference code read simulator ground truth, hidden state, or exogenous noise it should not see?
  - **Causal honesty:** is an observational pattern being presented as causal? Is an intervention implemented as graph surgery, or just "conditioning on a value"?
  - **Uncertainty:** does every prediction carry a spread? Is it calibrated, or just decorative?
  - **Reproducibility:** is every random source seeded and recorded?
  - **Separation:** are the four abilities (next-state, action-conditioned, intervention, counterfactual) still separate code paths, endpoints and metrics?
  - **Fabrication:** is any reported number produced by an actual run stored in `evaluations`?
  - **Human Terminal Rule** adherence (never wait or poll on long commands).
- **Loop Until Proud:** rate your work 1–10. If below 9, rewrite the plan or refine the code before finalizing.

### 2. Core Operational Rules
- **No Incomplete Code:** full implementations only. No `TODO: implement later`, no `# ... rest unchanged`.
- **Verify the Environment:** check the file tree, `pyproject.toml`, `package.json`, migrations and configs before proposing changes. Never assume.
- **Lean Context:** work in focused steps, touch only relevant modules, avoid sprawling refactors.
- **Self-Rating & Verification:** end every task by stating how you verified the change, any migrations/commands the user must run, and a rigorous 1–10 score with justification.
- **Simplest model that works:** do not pick a complex model because it sounds advanced. Justify the choice with data size, interpretability, training time and uncertainty quality.

---

## Non-Negotiable Technical Principles

1. **No LLM in the prediction path.** Numerical predictions come from the simulator / world model only. An LLM, if used at all, is an interface layer (e.g. explaining results in words) and never produces a number that is shown as a prediction.
2. **Every prediction carries uncertainty.** No endpoint, function, or UI element may return a bare point estimate. See the Prediction Envelope in `ARCHITECTURE.md`.
3. **Four abilities stay separated.** Next-state prediction, action-conditioned prediction, intervention, and counterfactual are distinct modules, endpoints, tests and metrics. Never merge them "for convenience".
4. **Keep four things distinct everywhere** (code, DB, UI): simulator truth · model prediction · uncertainty · actual measured result.
5. **Assumptions are explicit.** Causes, observability and randomness assumptions live in `docs/ASSUMPTIONS.md` with stable IDs (A1, A2, …). Predictions reference the assumption IDs they rely on.
6. **Never fabricate numbers.** Every metric shown in the UI, README, or slides must come from a stored evaluation run (`evaluations` table) with the git SHA and seed that produced it. If it has not been run, it says "not yet evaluated".
7. **Show failures, not only successes.** Failure modes (hidden confounder, out-of-distribution regime, long horizon) are first-class experiments with their own tests and reports.
8. **Correlation ≠ causation must be demonstrated by experiment**, not asserted. See "Causal Demonstrations" in `ARCHITECTURE.md`.
9. **Do not claim real industrial integration** unless it is actually implemented. The MVP is simulator-first.
10. **The engine is domain-independent.** Domain knowledge (variables, equations, graph) lives only in a `DomainSpec` plugin (initially the cooling system). Generic engine code must not hard-code "temperature" or "fan".

---

## Tech Stack (fixed unless an ADR in `docs/adr/` justifies a change)

| Layer | Choice |
|---|---|
| Language | Python 3.11+ (backend/ML), TypeScript (frontend) |
| API | FastAPI + Pydantic v2, served by uvicorn |
| Layer | Choice |
|---|---|
| Language | TypeScript (Frontend, Gateway API), Python 3.11+ (ML & Simulation engine) |
| Frontend | Next.js (App Router, TypeScript, Tailwind CSS, Recharts) |
| Gateway API | Fastify + TypeScript (Auth verification, Supabase client, OpenRouter orchestration, ML proxy) |
| Auth | Supabase Auth with Google OAuth (gates the entire app) |
| ML / Simulation Service | Python 3.11+ (FastAPI internal service, PyTorch CPU, NumPy, SciPy) |
| Causal Engine | Custom SCM layer in `ml-service/simulens/scm/`; `do()` graph surgery, counterfactual abduction |
| Simulator | Seeded NumPy state-transition equations (explicit exogenous noise, reproducible) |
| Storage | Supabase PostgreSQL (metadata, observed episodes, evaluations, reliability, AI sessions) + Parquet/Supabase Storage for bulk data |
| AI Reasoning Layer | OpenRouter API (Claude 3.5 Sonnet / GPT-4o / DeepSeek via OpenRouter) for NL-to-do(), root-cause anomaly hypothesis, intervention recommender, plain-language explainers, auto reports, and copilot chat |
| Tests | pytest, hypothesis (Python ML); Vitest / Jest (Fastify gateway & Next.js frontend) |
| Lint/format | ruff (Python), ESLint / Prettier (TypeScript / Next.js / Fastify) |
| Deployment | Vercel (Next.js) + Railway/Render (Fastify Gateway & Python ML Service) + Supabase Cloud |

---

## Repository Layout

```
SimuLens/
  AGENTS.md  ARCHITECTURE.md  DATABASE.md  GEMINI.md  HANDOVER.md
  PROJECT_CONTEXT_GPT.md
  docs/
    ASSUMPTIONS.md        # causal / observability / randomness assumptions (IDs A1..)
    EXPERIMENTS.md        # registry of experiments and how to reproduce them
    adr/                  # architecture decision records
  frontend/               # Next.js App Router (TypeScript, Tailwind CSS, Recharts, Supabase Auth)
    src/{app,lib,components,hooks}/
  gateway/                # Fastify TypeScript API Gateway & OpenRouter AI orchestration
    src/{routes,services,plugins,schemas}/
  ml-service/             # Python 3.11+ ML, Causal SCM, & Simulator engine
    pyproject.toml
    app/                  # FastAPI internal interface: main.py, routers, schemas
    simulens/             # importable engine package
      domain/             # DomainSpec interface + cooling_system/ plugin
      simulator/          # seeded simulator, policies, episode generator
      scm/                # graph, structural mechanisms, do() surgery, abduction
      models/             # transition models, baselines, ensembles
      uncertainty/        # aleatoric/epistemic, conformal calibration, OOD scoring
      interventions/      # intervention engine
      counterfactual/     # abduction-action-prediction engine
      validation/         # metrics, ground-truth comparison, reliability map
      store/              # Supabase / DB access, Parquet IO (repositories, no SQL in engines)
    scripts/              # generate_data.py, train.py, evaluate.py, run_experiment.py
    tests/
  supabase/               # Supabase migrations, RLS policies, schemas
    migrations/           # NNN_name.sql
  data/                   # gitignored: parquet, local caches, model artifacts
```

Folder rules:
- Engines in `ml-service/simulens/` never import from `app/`; `app/` is a thin HTTP layer over `simulens/`.
- Frontend never calls `ml-service` directly; all traffic flows through Next.js or `gateway/`.
- Fastify `gateway/` validates Supabase Google OAuth JWTs, handles OpenRouter AI calls, and proxies numerical requests to `ml-service`.
- SQL lives in `supabase/migrations/` and repository classes in `gateway/` and `ml-service/simulens/store/`.

---

## Commands (use exactly these; Windows / PowerShell)

Frontend (run from `frontend/`):
- Install: `npm install`
- Dev server: `npm run dev` (runs on http://localhost:3000)
- Build: `npm run build`
- Lint: `npm run lint`
- Tests: `npm run test`

Gateway API (run from `gateway/`):
- Install: `npm install`
- Dev server: `npm run dev` (runs on http://localhost:8000)
- Build: `npm run build`
- Lint: `npm run lint`
- Tests: `npm run test`

ML Service (run from `ml-service/`):
- Create venv: `python -m venv .venv` then `.venv\Scripts\Activate.ps1`
- Install: `pip install -e ".[dev]"`
- Dev server: `uvicorn app.main:app --reload --port 8001`
- Tests: `pytest -q`
- Lint/format: `ruff check .` and `ruff format .`
- Types: `mypy simulens`
- Generate data: `python scripts/generate_data.py --config configs/cooling_default.yaml --seed 1`
- Train: `python scripts/train.py --config configs/cooling_default.yaml`
- Evaluate: `python scripts/evaluate.py --model-id <id>`

Supabase (run from workspace root):
- Local start: `npx supabase start`
- Push migrations: `npx supabase db push`

---

## Human Terminal Rule

The AI agent must NEVER wait on long-running terminal processes. Examples: `pip install`, `npm install`, `npm run dev`, `uvicorn`, `python scripts/train.py`, large `pytest` runs, `docker ...`.

Instead:
1. Print the exact command.
2. Ask the user to run it and paste the output.
3. Continue after confirmation.

Never poll timers, never enter waiting loops. Short, instant commands (file listing, `git status`) are fine.

## API Contract Rule

Before renaming, removing or moving any exported function, Pydantic/Zod schema, or endpoint:
1. Search the whole project for every use of it (ML service, gateway, frontend `lib/api.ts`, tests, docs).
2. Update every consumer.
3. Run the relevant checks (`pytest -q`, `ruff check .`, `npm run build`).
4. Only then consider the change complete.

Never change a public contract without updating all consumers. The Prediction Envelope schema is the most sensitive contract in the project.

## Database-First Rule

Whenever a feature adds, removes or modifies stored fields:
1. Write the migration `supabase/migrations/NNN_name.sql` first.
2. Stop and present it; ask the user to run `npx supabase db push` (or execute via Supabase SQL editor).
3. Continue only after confirmation.
4. Then update repository classes in `ml-service/` and `gateway/`, then API, then UI.
5. Update `DATABASE.md` in the same change.

Never assume the live database matches the source code. Ground truth lives in a **separate** restricted PostgreSQL schema (`ground_truth`) accessible only by the service-role key for `simulator/` and `validation/`. Model, uncertainty, and inference code must NEVER query `ground_truth` (see Leakage Rule).

## Leakage Rule (critical)

The world model may only see what the deployed system could see: observed states, actions, and time. It must never read: latent state (e.g. fouling), exogenous noise draws, the simulator's true parameters, or `ground_truth.db`. Only `validation/` and `simulator/` may access ground truth. A test (`tests/test_no_leakage.py`) enforces this by import/path checks; do not weaken it.

## Reproducibility Rule

- Every stochastic call takes an explicit `numpy.random.Generator` or seed; no global RNG state.
- Every dataset, model, and evaluation row records: seed, config hash, git SHA.
- Any figure or metric in the deliverable must be regenerable with one documented command.

## Handover Rule

Every implementation ends with a `HANDOVER.md`-style summary containing:
- Objective
- Decisions made
- Files modified
- Database changes / migrations executed vs pending
- APIs changed
- Components/modules added
- Experiments run (with IDs) and metrics produced
- Remaining TODOs (priority order)
- Known risks / known failure modes
- Exact next task for the following coding agent

Assume the next agent has no prior context. Update `HANDOVER.md` at the end of each task.

---

## Coding Standards

### Python
- Type-hint all public functions; Pydantic models at API boundaries; dataclasses for internal value objects.
- Pure functions for numerics where possible; side effects (DB, files) only in `store/` and `scripts/`.
- Vectorize with NumPy; no Python loops over large batches.
- Docstrings on every public function stating: inputs (with units), outputs, and which ability/assumption it belongs to.
- Comments only for non-obvious math (abduction, do-surgery, calibration) and assumption references (`# A3`).
- Naming: snake_case for modules/functions/DB; PascalCase for classes; descriptive names (`predict_next_state`, `apply_intervention`, `abduct_noise`). Units in names when relevant (`temperature_c`, `power_kw`, `pressure_bar`).

### Frontend
- Functional components and hooks only; feature-first folders under `src/features/`.
- All charts show uncertainty bands and, when available, the actual outcome overlay. A chart of a prediction without its interval is a bug.
- Show loading, empty and error states on every view.
- UI style: clean, information-dense engineering dashboard; no decorative fluff. Colors must not be the only carrier of meaning (reliability level also has a text label).

### Testing (Definition of correctness)
- Unit tests for each mechanism and for `do()` surgery (forced variable ignores its parents).
- Property tests: simulator determinism under a seed; abduction → replay with unchanged action reproduces the original episode exactly (counterfactual consistency).
- Calibration tests on held-out data (e.g. 90% interval covers ≈90% within tolerance, reported not asserted blindly).
- Leakage test, described above.
- Regression tests that fail if a stored metric changes without a new evaluation run.

---

## Git Workflow
- Short-lived branch per task (`feat/simulator-core`, `feat/scm-do`, …).
- Small atomic commits; descriptive messages.
- Never commit: `data/`, model artifacts, `.env`, SQLite files, `.venv`, `node_modules`.

## Definition of Done
A feature is complete when:
- its data contract (schema/DB/API model) is defined,
- implementation and tests pass (`pytest -q`, `ruff check .`, `mypy simulens`, and `npm run build` where relevant),
- it returns uncertainty wherever it returns a prediction,
- its metric(s) are produced by a stored evaluation run,
- the assumptions it depends on are listed in `docs/ASSUMPTIONS.md`,
- `ARCHITECTURE.md` / `DATABASE.md` / `HANDOVER.md` stay consistent,
- and it does not break adjacent abilities.

## Delivery Phase Order (fixed; do not skip ahead)

1. **Simulator** — seeded cooling-system simulator, behavior policies, episode generator, ground-truth store.
2. **Prediction model** — next-state and action-conditioned transition models + baselines.
3. **Uncertainty** — ensemble/aleatoric-epistemic split, conformal calibration, OOD scoring.
4. **Intervention engine** — `do()` on any variable, multi-step rollouts.
5. **Counterfactual engine** — abduction → action → prediction on recorded episodes.
6. **Validation** — metrics vs ground truth, reliability map, causal demonstrations, failure experiments.
7. **API + Dashboard** — FastAPI endpoints and React dashboard.
8. **Optional** — physical prototype (ESP32 etc.). Extension, never a dependency.

Do not build the dashboard before phases 1–6 produce real, stored results.

## Never-Do Rules
- Never let an LLM produce a displayed prediction.
- Never return a prediction without uncertainty.
- Never let model code touch ground truth, latent state, or noise draws.
- Never present a correlation-based estimate as an interventional one.
- Never report a metric that was not produced by a recorded run.
- Never hard-code domain variables inside generic engine modules.
- Never merge the four abilities into a single endpoint or function.
- Never claim industrial deployment or real-world impact numbers that were not measured.
- Never commit secrets, datasets, or model binaries.
