# Handover Summary — SimuLens

> **Current task:** Tech stack finalization & architectural specification. Aligned with user decisions: Supabase (PostgreSQL + Google OAuth gating), Next.js (Frontend), Fastify (Gateway & OpenRouter AI orchestration), Python 3.11 (ML, SCM, Simulator & Uncertainty service).

---

## 1. Objective
Build **SimuLens**, an uncertainty-aware causal world model and intervention simulation engine for L&T Technology Services Challenge #44. The system supports four distinct causal abilities (next-state prediction, action-conditioned prediction, intervention `do()`, and counterfactual replay), provides calibrated uncertainty envelopes on all predictions, proves correlation is not causation, and equips industrial engineers with an OpenRouter-powered causal copilot and intervention recommender.

---

## 2. Decisions Made

1. **Tech Stack & System Topology:**
   - **Frontend:** Next.js 14+ (App Router, TypeScript, Tailwind CSS, Recharts). Gated entirely behind Supabase Google OAuth login.
   - **Gateway API:** Fastify + TypeScript. Validates Supabase JWTs, handles OpenRouter AI prompt orchestration, and proxies numerical tasks to the Python ML service.
   - **ML & Simulation Service:** Python 3.11+ (FastAPI internal service, PyTorch CPU, NumPy, SciPy). Implements the seeded SCM simulator, learned mechanism ensembles, conformal calibration, graph surgery `do()`, and counterfactual noise abduction.
   - **Database & Auth:** Supabase PostgreSQL with Row Level Security (RLS) and Supabase Auth with Google OAuth provider.
   - **Deployment Target:** Vercel (Next.js), Railway or Render (Fastify Gateway & Python ML Service), Supabase Cloud.

2. **Strict Causal & Architectural Invariants:**
   - **Principle #1 (No LLM in prediction path):** Numerical predictions originate exclusively from the simulator or PyTorch world model. OpenRouter AI acts strictly as an interface and reasoning copilot (never outputs or calculates raw predicted numbers).
   - **6 OpenRouter AI Features:**
     1. Natural-language what-if translation to structured `do()` JSON.
     2. Solution recommender (intervention search + trade-off synthesis).
     3. Anomaly detection with causal root-cause hypotheses (DAG traversal).
     4. Plain-language explanations of counterfactuals & uncertainty envelopes.
     5. Auto-generated incident, experiment, and validation post-mortem reports.
     6. Interactive conversational copilot over episodes, metrics, and reliability maps.
   - **Leakage Protection:** Two isolated database schemas: `public` (for observed data, models, evaluations, AI sessions) and `ground_truth` (restricted schema accessible ONLY via `service_role` key; forbidden to model training, inference, and gateway).

---

## 3. Files Modified (this task)
- `AGENTS.md` — Updated tech stack table, repository layout, commands, and database/leakage rules.
- `ARCHITECTURE.md` — Added §2.1 System Architecture block diagram, §2.2 OpenRouter AI capabilities (contracts & boundaries), updated §10 API surface, §11 Frontend views, and §12 Deployment.
- `DATABASE.md` — Rewritten for Supabase PostgreSQL (Postgres DDL, RLS policies, Google OAuth user profiles, and restricted `ground_truth` schema).
- `HANDOVER.md` — Updated with current state, decisions, and immediate next steps.

---

## 4. Database Changes
None applied yet. Planned initial migration is specified in `DATABASE.md`: `supabase/migrations/001_init.sql`.

---

## 5. APIs Defined
Full API contract specified in `ARCHITECTURE.md` §10:
- Core simulator & inference routes (`/api/v1/simulator/*`, `/api/v1/predict/*`, `/api/v1/intervene`, `/api/v1/counterfactual`).
- Validation & causal routes (`/api/v1/validate/*`, `/api/v1/causal/*`).
- OpenRouter AI routes (`/api/v1/ai/nl-what-if`, `/api/v1/ai/recommend-solution`, `/api/v1/ai/diagnose-anomaly`, `/api/v1/ai/explain`, `/api/v1/ai/generate-report`, `/api/v1/ai/chat`).

---

## 6. Remaining TODOs (priority order)

1. Create `docs/ASSUMPTIONS.md` with stable IDs (C1–C3, O1–O3, R1–R3, I1–I2) and simulator reference constants.
2. Create initial Supabase migration `supabase/migrations/001_init.sql` (Database-First Rule).
3. Scaffold `ml-service/` (`pyproject.toml`, package layout, configs).
4. Implement Phase 1: seeded cooling-system simulator, behavior policies, episode generator, ground-truth store, and `tests/test_no_leakage.py`.
5. Scaffold `gateway/` (Fastify TypeScript service, Supabase client, OpenRouter SDK).
6. Scaffold `frontend/` (Next.js 14 App Router, Supabase Google OAuth integration).
7. Phase 2–6: Models, Ensembles, Conformal Uncertainty, `do()` engine, Counterfactual engine, Validation & Causal Demos.
8. Phase 7: UI Dashboard, AI Copilot Drawer, and Report Generator.

---

## 7. Known Risks
- Latent fouling $\phi$ makes counterfactuals approximate for learned models; oracle vs filtered latent must be evaluated and documented separately.
- OpenRouter prompt engineering must strictly forbid hallucinating numerical predictions and always cite verified DB/envelope figures.
- Strict phase order: no premature dashboard building before Phase 1–6 simulation and model metrics are recorded in `evaluations`.

---

## 8. Exact Next Task for the Following Coding Agent
1. Create `docs/ASSUMPTIONS.md`.
2. Write initial migration `supabase/migrations/001_init.sql` matching `DATABASE.md` §3 and §4.
3. Scaffold `ml-service/` (`pyproject.toml`, directory structure, `configs/cooling_default.yaml`).
4. Ask user via Human Terminal Rule to initialize the Python venv and install dependencies in `ml-service/`.
