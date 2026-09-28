# SimuLens — Architecture

Uncertainty-aware causal world model and intervention simulation engine. Simulator-first; the true outcome is always known, so every claim is checkable.

> Status: design baseline. Variable constants below are the *reference form* — finalize them in `docs/ASSUMPTIONS.md` and `configs/cooling_default.yaml` when the simulator is built, then keep this file in sync.

---

## 1. Goals (from the problem statement)

Four clearly separated abilities:

| # | Ability | Question | Formal object |
|---|---|---|---|
| 1 | Next-state prediction | "What happens next?" | P(S_{t+1} \| S_t) — action marginalized over the behavior policy |
| 2 | Action-conditioned prediction | "What happens if I choose action a?" | P(S_{t+1} \| S_t, A_t = a) |
| 3 | Intervention | "What happens if I force variable X to x, regardless of what would naturally occur?" | P(· \| do(X = x)) via graph surgery |
| 4 | Counterfactual | "In this recorded episode, what if action at time k had been different, everything else about that episode fixed?" | Abduction → action → prediction on the episode's own noise |

Plus: uncertainty on every prediction, prediction-vs-actual comparison, identification of unreliable conditions, and demonstration that patterns are not mistaken for cause and effect.

---

## 2. Modeling Approach (hybrid)

- **Structure: expert-defined causal graph** (documented, versioned, testable).
- **Mechanisms: learned** — each variable's conditional distribution is learned as a function of *only its causal parents* (a structure-respecting learned SCM). This makes `do()` a real graph surgery rather than a prompt-time trick.
- **Baseline for comparison: black-box transition model** S_{t+1} = f(S_t, A_t) with no graph constraints. The comparison (black-box vs structural) is one of the key experiments.
- **Simulator: rule-based SCM with explicit exogenous noise**, used as ground truth.

Model candidates (choose by evidence, record in an ADR): linear-Gaussian baseline → per-mechanism probabilistic MLP (Gaussian NLL head) ensembles → small Gaussian process on a reduced state space if data is sparse. Start with the simplest that passes calibration checks.

---

## 2.1 System Architecture & Tech Stack

```
+-----------------------------------------------------------------------------------+
|                            Next.js 14+ Frontend (Vercel)                          |
|  - Google OAuth Login via Supabase (gating entire app)                            |
|  - Interactive Causal Graph & Live Twin Dashboard                                 |
|  - Prediction Bands, Counterfactual Replay, AI Copilot & Incident Reports         |
+------------------------------------------+----------------------------------------+
                                           | HTTP / SSE
                                           v
+-----------------------------------------------------------------------------------+
|                        Fastify Gateway Service (Railway/Render)                   |
|  - Validates Supabase JWT & handles User Profiles                                 |
|  - Orchestrates OpenRouter AI requests & prompt engineering                       |
|  - Proxies numerical simulation & inference to Python ML service                  |
|  - Communicates with Supabase Postgres (read/write observed data)                 |
+-------------------+-----------------------------------+---------------------------+
                    |                                   |
         HTTP (Internal / Private VPC)                  | OpenRouter HTTPS API
                    v                                   v
+----------------------------------------+  +---------------------------------------+
|   Python 3.11 ML Service (Railway/Render) |  |   OpenRouter AI Reasoning Layer       |
|  - Seeded SCM Simulator & Noise Abduction |  |  - Claude 3.5 Sonnet / GPT-4o         |
|  - Probabilistic MLP Ensembles (PyTorch)  |  |  - Strict Interface Layer (NO NUMBERS)|
|  - Conformal Calibration (CQR/Split)     |  |  - NL-to-Intervention Translator      |
|  - do() Graph Surgery Engine              |  |  - Anomaly Root-Cause Hypotheses      |
|  - Counterfactual Engine                  |  |  - Solution Recommender Synthesis     |
+-------------------+--------------------+  |  - Post-Mortem Report Generator       |
                    |                       |  - Interactive Chat Copilot           |
                    | Service Role Only     +---------------------------------------+
                    v
+-----------------------------------------------------------------------------------+
|                           Supabase PostgreSQL Database                            |
|  [public / simulens schema]        | [ground_truth schema - RESTRICTED]           |
|  - Users & Profiles (Google OAuth) | - Latent fouling phi_t                       |
|  - Datasets & Observed Episodes    | - True exogenous noise draws epsilon         |
|  - Trained Models & Checkpoints    | - True simulator physical parameters         |
|  - Evaluations & Reliability Maps  | * Model code & Gateway NEVER have access     |
|  - AI Sessions & Generated Reports | * Accessible ONLY by simulator & validator   |
+------------------------------------+----------------------------------------------+
```

---

## 2.2 OpenRouter AI Capabilities (Strict Interface Layer)

**Principle #1 Enforced:** An LLM never produces a numerical prediction. Every number shown originates from the Python SCM simulator, learned ensembles, or conformal calibration records stored in the database. OpenRouter powers 6 semantic reasoning and assistance capabilities:

1. **Natural-Language What-If to Structured Intervention (`POST /api/v1/ai/nl-what-if`):**
   - User inputs free-form queries (e.g. *"What happens to temperature if we drop machine load to 40% and max out fans on a hot 38°C afternoon?"*).
   - LLM translates this into a validated JSON payload for `do()` surgery:
     `{"interventions": {"L": 40.0, "F": 100.0}, "context": {"Ta": 38.0}, "horizon": 30}`.
   - Fastify routes this structured payload to the Python ML service `/intervene` endpoint.

2. **Solution Recommender / Intervention Search (`POST /api/v1/ai/recommend-solution`):**
   - Given an operational constraint (e.g., *"Reduce machine temperature below 68°C while keeping power consumption under 14 kW"*), the Python engine searches candidate interventions (`grid` or `CMA-ES` over actions $L, F, C$) and computes prediction envelopes.
   - OpenRouter synthesizes the numerical Pareto frontier into a structured ranking with actionable trade-off analysis.

3. **Anomaly Detection with Root-Cause Hypotheses (`POST /api/v1/ai/diagnose-anomaly`):**
   - Detects when sensor steps deviate beyond conformal prediction bands ($>95\%$ interval breach).
   - Traverses the SCM causal graph backwards from the breached variable (e.g., Vibration spike) to generate structured hypotheses (e.g., *"Vibration is an effect, not a cause; either Load increased or latent Heat-Exchanger fouling degraded heat transfer"*).

4. **Plain-Language Explanations of Counterfactuals & Uncertainty Envelopes (`POST /api/v1/ai/explain`):**
   - Explains complex multi-step interval envelopes, calibration reliability, and abduction results in clear, intuitive operational terms without statistical jargon.

5. **Auto-Generated Incident, Experiment & Validation Reports (`POST /api/v1/ai/generate-report`):**
   - Generates executive-ready post-mortem markdown reports summarizing model performance, distribution shift regressions, out-of-distribution risks, and causal demonstration refutations with citations to exact experiment IDs and git SHAs.

6. **Interactive Conversational Copilot (`POST /api/v1/ai/chat`):**
   - Context-aware chat assistant over episodes, causal metrics, reliability maps, and active simulation states. Answers engineer queries by retrieving structured facts from the database and ML service.

---

## 3. Time Convention and Variables

Discrete time. At step t the controller picks actions A_t; the plant then produces S_{t+1}. One step = one sampling interval (e.g. 30 s of simulated time; set in config).

| Role | Variable | Symbol | Unit | Observed by model? |
|---|---|---|---|---|
| Exogenous / environment | Ambient temperature | Ta_t | °C | Yes |
| Action (controllable) | Machine load | L_t | % | Yes |
| Action (controllable) | Fan speed | F_t | % | Yes |
| Action (controllable) | Coolant flow | C_t | % | Yes |
| State (observed) | Machine temperature | T_t | °C | Yes (noisy sensor) |
| State (observed) | Pressure | P_t | bar | Yes (noisy sensor) |
| State (observed) | Power consumption | W_t | kW | Yes (noisy sensor) |
| State (observed) | Vibration | V_t | mm/s | Yes (noisy sensor) |
| State (**latent**) | Heat-exchanger fouling | φ_t | 0–1 | **No** — simulator only |
| Derived (not stored) | Cooling efficiency | η_t | — | Computed from mechanisms |

Variables may be reduced if implementation needs it, but the graph and assumptions must be updated to match.

### 3.1 Reference structural equations (simulator truth)

Each variable = deterministic mechanism of its parents + independent exogenous noise ε.

```
φ_{t+1} = clip(φ_t + δ + ε_φ, 0, φ_max)                       # slow latent degradation
Ta_{t+1} = Ta_t + κ (Ta_mean(t) − Ta_t) + ε_Ta                 # diurnal drift + noise
cool_t   = (b1·F_t + b2·C_t) · (1 − φ_t) · (T_t − Ta_t) / 50   # heat removal
T_{t+1}  = T_t + η_T (a1·L_t − cool_t) + ε_T
P_{t+1}  = p0 + p1·C_t + p2·(T_{t+1} − Ta_t) + ε_P             # contemporaneous T→P
W_{t+1}  = w0 + w1·L_t + w2·(F_t/100)^3 + w3·C_t + ε_W         # fan cube law
V_{t+1}  = v0 + v1·L_t + v2·F_t + v3·φ_t + ε_V                 # vibration is a pure EFFECT
```

Noise terms are additive, mutually independent, and drawn from a recorded seed (Assumption R1). Additive noise is what makes exact abduction possible in the simulator.

### 3.2 Causal graph (edges within/between steps)

```
Ta_t ──────────────┬─────────────► T_{t+1}
L_t  ──────────────┼─► T_{t+1}
F_t  ──────────────┼─► T_{t+1}     (cooling)
C_t  ──────────────┼─► T_{t+1}
T_t  ──────────────┼─► T_{t+1}
φ_t  ──(hidden)────┼─► T_{t+1}, V_{t+1}

T_{t+1} ─► P_{t+1}      C_t ─► P_{t+1}      Ta_t ─► P_{t+1}
L_t, F_t, C_t ─► W_{t+1}
L_t, F_t, φ_t ─► V_{t+1}          (V does NOT cause T)
```

The graph is versioned in `simulens/domain/cooling_system/graph.py` and exported to the UI. `V → T` deliberately does not exist: vibration correlates with temperature (shared causes L and φ) but is not a cause of it. This is the basis of a causal demonstration (§9).

---

## 4. Assumptions (must be stated; full list in `docs/ASSUMPTIONS.md`)

**Causal (C)**
- C1: The expert graph in §3.2 is the true structure of the simulator. For the learned model, it is an *assumed* structure; we test its sensitivity (graph-misspecification experiment).
- C2: No instantaneous feedback loops within a step except T_{t+1} → P_{t+1}.
- C3: Mechanisms are stable (invariant) under interventions (modularity / autonomy).

**Observability (O)**
- O1: The model observes Ta, L, F, C, T, P, W, V with sensor noise; it does **not** observe φ (fouling).
- O2: Sensor noise is part of the observed values; true (noise-free) states are not available to the model.
- O3: Episodes are recorded fully (all observed variables at every step, no missing data) in the MVP.

**Randomness (R)**
- R1: All stochasticity is additive, independent, per-step exogenous noise, seeded and recorded in ground truth.
- R2: Noise is Gaussian in the default config (heavy-tailed variant is a stress experiment).
- R3: Noise scale may differ by regime (heteroscedastic variant is a stress experiment).

**Identifiability (I)**
- I1: When the behavior policy depends only on *observed* variables, the interventional effect is identifiable by backdoor adjustment on those variables.
- I2: When the behavior policy depends on the *hidden* φ, identifiability fails from observational data alone. This is a designed failure mode, not a bug.

---

## 5. High-Level Architecture

```
                ┌───────────────────────────────┐
                │  React Dashboard (Vite + TS)  │
                │  Console · Predict · Intervene│
                │  Counterfactual · Validation  │
                │  Reliability · Causal Tests   │
                └───────────────┬───────────────┘
                                │ HTTPS/JSON
                ┌───────────────▼───────────────┐
                │ FastAPI (thin layer)          │
                │ routers · Pydantic envelope   │
                └───────────────┬───────────────┘
                                │
   ┌────────────────────────────▼────────────────────────────────┐
   │                    simulens/ engine package                 │
   │                                                             │
   │  domain/ (DomainSpec plugin: cooling_system)                │
   │      │                                                      │
   │  simulator/ ──episodes──► store/ ──► SQLite + Parquet       │
   │      │  (ground truth → ground_truth.db, restricted)        │
   │      ▼                                                      │
   │  scm/ (graph, mechanisms, do() surgery, abduction)          │
   │      ▲                                                      │
   │  models/ (learned mechanisms + black-box baseline)          │
   │      ▲                                                      │
   │  uncertainty/ (ensembles, conformal, OOD score)             │
   │      ▲                                                      │
   │  ┌───┴──────────┬───────────────┬──────────────────┐        │
   │  │ predict_next │ predict_action│ interventions/   │        │
   │  │ (ability 1)  │ (ability 2)   │ (ability 3)      │        │
   │  └──────────────┴───────────────┴──────────────────┘        │
   │              counterfactual/ (ability 4)                    │
   │                          │                                  │
   │  validation/ (metrics vs ground truth, reliability map,     │
   │               causal demonstrations, failure experiments)   │
   └─────────────────────────────────────────────────────────────┘
```

**Generic engine + domain plugin.** `DomainSpec` supplies variable definitions (name, unit, role, bounds, observed?), the expert causal graph, the simulator, and default behavior policies. Everything outside `domain/` is domain-agnostic. A second domain (battery, HVAC, etc.) should require only a new plugin.

**Leakage boundary.** `validation/` and `simulator/` may read ground truth. `models/`, `uncertainty/`, `scm/` (inference paths), `interventions/`, `counterfactual/` and `app/` inference routes may not. Enforced by `tests/test_no_leakage.py`.

---

## 6. The Four Abilities — Data Flow

### 6.1 Next-state prediction (observational)
Input: S_t (and optionally short history). The behavior-policy model π(A | S) is learned from the same observational data; the prediction marginalizes over actions:
P(S_{t+1} | S_t) = Σ_a π(a | S_t) · P(S_{t+1} | S_t, a) — estimated by sampling actions from π and pushing through the mechanisms. Uncertainty includes the policy's spread. Output: Prediction Envelope per observed variable.

### 6.2 Action-conditioned prediction
Input: S_t, A_t = a (chosen, not forced against causes). Push (S_t, a) through the learned mechanisms. Output: Prediction Envelope. Difference from 6.1: the action is given, not sampled.

### 6.3 Intervention — `do(X = x)`
Input: S_t (or an episode state), target variable X (action *or* state), forced value x, start step, horizon H.
1. Copy the SCM; remove all incoming edges to X (graph surgery); fix X := x for the intervention window.
2. Roll the remaining mechanisms forward H steps; downstream variables respond, upstream variables are untouched.
3. Sample many trajectories (ensemble members × noise draws) → per-step distribution.
Output: trajectory of Prediction Envelopes, plus effect vs the un-intervened rollout. The system must ensure forcing X ignores what would have caused X (e.g. do(F = 80) ignores the thermostat rule that would have set F from T).

### 6.4 Counterfactual — abduction → action → prediction
Input: episode_id, change point k, changed variable (an action), new value.
1. **Abduction:** from the recorded episode, infer each step's exogenous noise ε_t = observed_{t+1} − mechanism(observed parents at t). For additive noise this is a residual. For learned mechanisms the residual is an estimate (carries model error); the latent φ is estimated by a simple filter over residuals (assumption O1) — the oracle variant (true φ) is evaluated separately.
2. **Action:** replace the chosen action at step k (and only that, unless a sequence is given).
3. **Prediction:** replay steps k..end with the *same* inferred noise and the new action; downstream states change accordingly.
Output: actual vs counterfactual trajectories with uncertainty (model-parameter uncertainty plus abduction uncertainty), never a single line.
Ground truth: the simulator replays the same episode with the stored true noise and the changed action, giving the *exact* counterfactual. This is what the model is scored against.
Sanity invariant (tested): counterfactual with an unchanged action reproduces the recorded episode.

**Intervention vs counterfactual (for the presentation):** intervention = forward-looking, population-level "what if I set X now"; counterfactual = backward-looking, about one specific recorded episode with its specific noise held fixed.

---

## 7. Uncertainty Design

Every prediction returns this envelope (Pydantic `PredictionEnvelope`, see `app/schemas/`):

```json
{
  "kind": "next_state | action_conditioned | intervention | counterfactual",
  "variable": "temperature_c",
  "horizon_step": 1,
  "mean": 70.1,
  "std": 1.9,
  "aleatoric_std": 1.4,
  "epistemic_std": 1.3,
  "intervals": {"50": [68.8, 71.4], "80": [67.7, 72.5], "90": [67.0, 73.2], "95": [66.4, 73.8]},
  "confidence": {"tolerance": 2.0, "probability": 0.71},
  "reliability": {"level": "high | medium | low", "region": "R-014", "reason": "support: 1,240 training points nearby; ensemble agreement high"},
  "assumptions": ["C1", "O1", "R1"]
}
```

- **Aleatoric** (irreducible noise): learned variance head per mechanism.
- **Epistemic** (lack of knowledge): ensemble disagreement (K members, different seeds/bootstrap).
- **Calibration:** split conformal (or CQR) on a held-out calibration set so stated interval levels are empirical, not assumed. Coverage is *reported* per ability and per region.
- **Confidence** is *defined*, not decorative: probability mass of the predictive distribution inside a user-set tolerance band around the mean. It is never a made-up percentage.
- **Reliability** is separate from confidence: derived from training-support density (kNN / Mahalanobis in the observed-input space), ensemble disagreement, and the region's historical error. Uncertainty widens outside the well-observed region, and the envelope's `reason` says why in words.
- **Multi-step:** uncertainty propagates by sampling; intervals grow with horizon; reported per horizon.

---

## 8. Validation Engine

Ground truth exists, so each ability is scored against it.

| Ability | Ground truth | Metrics |
|---|---|---|
| Next-state | Held-out simulator transitions | MAE, RMSE, NLL, CRPS, PICP@{50,80,90,95}, mean interval width, interval score, calibration error |
| Action-conditioned | Simulator step under the same S_t and a | Same as above |
| Intervention | Simulator run under `do()`, repeated with many noise seeds → true interventional distribution | Mean-effect error, distribution distance (CRPS / Wasserstein-1), coverage of the true mean by the predicted interval, sign-of-effect accuracy |
| Counterfactual | Simulator replay with stored true noise + changed action (exact) | Trajectory MAE/RMSE, coverage of the true counterfactual path, error vs abduction quality (oracle-φ vs filtered-φ) |

Additional analyses:
- **Error vs horizon** (1, 5, 10, 30 steps).
- **Reliability map:** operating-region bins (e.g. on L, F, Ta, T) with n_train, error, coverage, and a High/Medium/Low label; low-support regions are flagged in the UI.
- **Distribution shift:** train on a subset of regimes; test on out-of-range ambient, extreme load, and a fouled heat-exchanger regime.
- Every evaluation writes rows to `evaluations` (with seed, git SHA, model ID). The UI and slides read only from there.

---

## 9. Causal Demonstrations ("a pattern is not cause and effect")

Each is an experiment with stored numbers, a test, and a dashboard panel.

1. **Thermostat confound (identifiable).** Behavior policy sets F = f(T, L) — fan speed rises when temperature is high. In observational data F and T are *positively* correlated. Naive regression of T_{t+1} on F suggests fans heat the machine. The structural model (adjusting for T_t, L_t) and the simulator's `do(F=f)` both show fans cool it. Report: naive coefficient sign vs interventional effect vs model's `do()` effect.
2. **Vibration is an effect, not a cause.** V correlates strongly with T (common causes L, φ). `do(V=v)` leaves T unchanged in the simulator; the model must agree, while a naive black-box model that uses V as a feature may not.
3. **Ambient confounding.** Hot afternoons → higher scheduled load → higher T. Ambient must be adjusted for; show load's effect with and without adjustment.
4. **Hidden confounder (designed failure).** Policy depends on latent φ (operators know the exchanger is fouled). Observational fit of the fan effect is biased; a small randomized-action dataset partly fixes it. Report the bias and how much randomization is needed.
5. **Graph misspecification.** Add a wrong edge (V→T) or drop a real one (Ta→T); show how intervention error grows.
6. **Refutation-style checks:** placebo variable, random common cause, data subset stability.

Training data mixture is explicit: `observational` (behavior policy), `randomized` (uniform/space-filling actions), `confounded_hidden`, `ood_stress`. Each episode is tagged with its policy type.

---

## 10. API Surface (Fastify Gateway, prefix `/api/v1`)

All client routes require a valid Supabase Google OAuth Bearer JWT.

| Method | Path | Component / Purpose | Target |
|---|---|---|---|
| POST | `/api/v1/simulator/episodes` | Generate an episode (seed, regime, policy) | Proxies to ML Service |
| GET | `/api/v1/simulator/episodes` | List recorded episodes (observed data only) | Supabase DB |
| GET | `/api/v1/simulator/episodes/:id` | Fetch episode steps (observed data only) | Supabase DB |
| POST | `/api/v1/predict/next` | Ability 1: Next-state prediction | Proxies to ML Service |
| POST | `/api/v1/predict/action` | Ability 2: Action-conditioned prediction | Proxies to ML Service |
| POST | `/api/v1/intervene` | Ability 3: Intervention `do()` multi-step rollout | Proxies to ML Service |
| POST | `/api/v1/counterfactual` | Ability 4: Abduction -> Action -> Prediction | Proxies to ML Service |
| POST | `/api/v1/validate/compare` | Run prediction and simulator side by side | Proxies to ML Service |
| GET | `/api/v1/validation/summary` | Stored metrics from `evaluations` | Supabase DB |
| GET | `/api/v1/validation/reliability` | Reliability region map | Supabase DB |
| GET | `/api/v1/causal/graph` | Graph topology & assumptions | Fastify / ML Service |
| GET | `/api/v1/causal/demos` | Stored causal-demonstration experiment results | Supabase DB |
| **POST** | `/api/v1/ai/nl-what-if` | AI Feature 1: NL query -> structured `do()` JSON | Fastify + OpenRouter |
| **POST** | `/api/v1/ai/recommend-solution` | AI Feature 2: Intervention search + synthesized plan | ML Service + OpenRouter |
| **POST** | `/api/v1/ai/diagnose-anomaly` | AI Feature 3: Sensor breach -> causal root cause | ML Service + OpenRouter |
| **POST** | `/api/v1/ai/explain` | AI Feature 4: Plain-language envelope/abduction explainer | Fastify + OpenRouter |
| **POST** | `/api/v1/ai/generate-report` | AI Feature 5: Auto-generate incident & validation report | Supabase + OpenRouter |
| **POST** | `/api/v1/ai/chat` | AI Feature 6: Conversational copilot session message | Supabase + OpenRouter |

Rules:
- Inference routes never touch ground truth; only `/validate/*` and `/simulator/*` may call the simulator's internal truth path.
- All prediction responses return the strictly typed `PredictionEnvelope`.
- AI endpoints never fabricate predicted numbers; they consume numerical envelopes from the ML service and synthesize natural-language explanations, plans, and hypotheses.

---

## 11. Frontend Views (Next.js App Router)

The entire application is gated behind **Supabase Google OAuth login**.

1. **Login & Auth Gate (`/login`)** — Google OAuth sign-in via Supabase; redirects to dashboard upon session validation.
2. **Live Digital Twin Console (`/console`)** — Real-time telemetry, simulated plant controls (Load, Fan, Coolant), step/pause execution.
3. **Predict Studio (`/predict`)** — Next-state and action-conditioned rollouts with uncertainty bands (50/80/90/95%), confidence metric, and reliability support badge.
4. **Intervention Sandbox (`/intervene`)** — Interactive `do()` surgery. Supports manual parameter setting OR natural-language what-if input bar (translating user query via OpenRouter into `do(X=x)`). Side-by-side comparison of predicted interventional distribution vs actual simulator outcome.
5. **Counterfactual Studio (`/counterfactual`)** — Select historical episode, choose branching step $k$, modify past actions, and compare original path vs abduced counterfactual vs ground truth.
6. **Solution Recommender Panel (`/recommender`)** — Set target goals (e.g. max temperature, power budget); evaluates candidate interventions and displays OpenRouter-synthesized Pareto trade-off recommendations.
7. **Validation & Reliability Explorer (`/validation`)** — Metrics scorecard, calibration error plots, coverage by horizon, and interactive operating-region reliability map with OOD stress test launcher.
8. **Causal Knowledge & Refutation Hub (`/causal`)** — Interactive DAG visualization, assumptions registry (C1-C3, O1-O3, R1-R3), and the 5 empirical correlation-vs-causation demonstration experiments.
9. **AI Copilot & Incident Reports (`/copilot`, `/reports`)** — Persistent conversational drawer accessible across views; markdown export of validation post-mortems and anomaly incident reports.

---

## 12. Deployment Architecture

- **Frontend:** Vercel (Next.js 14+ Edge/Node runtime, automatic SSR & ISR).
- **Gateway API:** Railway or Render (Fastify Node.js service running on port 8000, connected to Supabase and OpenRouter).
- **ML & Simulation Service:** Railway or Render (Python 3.11 container with PyTorch CPU and NumPy, running on private VPC port 8001).
- **Database & Auth:** Supabase Cloud (Managed PostgreSQL 15, Supabase Auth with Google OAuth, Storage buckets for Parquet).

---

## 13. Key Risks

| Risk | Mitigation |
|---|---|
| Counterfactual with latent φ is only approximate | Evaluate oracle-φ vs filtered-φ separately; state the limitation |
| Ensemble intervals under-cover | Conformal calibration; report empirical coverage per region |
| Model looks good in-distribution only | Mandatory OOD/regime-shift experiments |
| Over-claiming / LLM hallucinations | "Never fabricate numbers" rule; LLM operates strictly as an interface layer consuming verified DB/ML records |
| Scope creep into UI before results | Fixed phase order in `AGENTS.md` |
