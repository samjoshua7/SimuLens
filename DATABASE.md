# SimuLens — Database Design (Supabase PostgreSQL)

Primary storage: **Supabase PostgreSQL** for metadata, observed time-series, models, predictions, evaluations, reliability maps, and AI copilot sessions. **Supabase Storage** (or local Parquet) for bulk dataset trajectories.

> Status: Supabase PostgreSQL design baseline. The initial migration `supabase/migrations/001_init.sql` will be created and reviewed before applying via Supabase CLI (`npx supabase db push`) or SQL editor (Database-First Rule in `AGENTS.md`).

---

## 1. Two Physical Schemas (Leakage Protection)

To guarantee that the machine learning models, Fastify gateway, Next.js frontend, and end-users **never** read ground-truth simulation variables, the database enforces strict schema-level isolation:

| Schema | Contents | Access Permissions | Who may access |
|---|---|---|---|
| `public` | User profiles, observed data, models, predictions, evaluations, reliability regions, causal demos, AI sessions | `authenticated`, `anon` (read-only RLS) | Next.js, Fastify Gateway, Python ML Service, OpenRouter AI |
| `ground_truth` | Latent fouling $\phi_t$, true exogenous noise draws $\epsilon$, true simulator physical parameters | **`service_role` ONLY** (`REVOKE ALL FROM anon, authenticated`) | **Only** `simulator/` generator and `validation/` engine |

Model training, inference, and the Fastify gateway **never** possess database permissions or client keys for the `ground_truth` schema. `tests/test_no_leakage.py` validates this separation programmatically.

---

## 2. Conventions & Supabase Integration
- PostgreSQL 15+ native features: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`.
- Units encoded directly in column names: `temperature_c`, `pressure_bar`, `power_kw`, `vibration_mm_s`, `load_pct`, `fan_pct`, `coolant_pct`, `ambient_c`.
- Structured payloads: `JSONB` with JSON constraints.
- Auth: Google OAuth managed by **Supabase Auth** (`auth.users`), mapped to `public.profiles`.
- Row-Level Security (**RLS**): Enabled on all `public` tables; user-specific records (copilot chats, custom what-if runs) are scoped to `auth.uid()`.

---

## 3. `public` Schema (Observed World & ML Workspace)

```sql
-- 1. User profiles synced from Supabase Google OAuth
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('engineer', 'admin', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- 2. Simulator Configurations (observed side)
CREATE TABLE public.simulator_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       TEXT NOT NULL,                                  -- e.g. 'cooling_system'
  version      TEXT NOT NULL,
  config_hash  TEXT NOT NULL UNIQUE,
  config_json  JSONB NOT NULL,                                 -- observed-side config (no true physics params)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.simulator_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read configs" ON public.simulator_configs FOR SELECT TO authenticated USING (true);

-- 3. Datasets Registry
CREATE TABLE public.datasets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,
  simulator_config_id  UUID NOT NULL REFERENCES public.simulator_configs(id),
  seed                 BIGINT NOT NULL,
  n_episodes           INTEGER NOT NULL,
  storage_path         TEXT,                                   -- Supabase Storage bucket path or Parquet URL
  git_sha              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read datasets" ON public.datasets FOR SELECT TO authenticated USING (true);

-- 4. Observed Episodes
CREATE TABLE public.episodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  seed          BIGINT NOT NULL,
  policy_type   TEXT NOT NULL CHECK (policy_type IN
                  ('observational','randomized','confounded_hidden','ood_stress','scripted_demo')),
  regime        TEXT NOT NULL DEFAULT 'nominal',                -- nominal, hot_ambient, high_load, fouled
  split         TEXT NOT NULL CHECK (split IN ('train','calibration','val','test','ood')),
  n_steps       INTEGER NOT NULL CHECK (n_steps > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_episodes_dataset_split ON public.episodes(dataset_id, split);
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read episodes" ON public.episodes FOR SELECT TO authenticated USING (true);

-- 5. Observed Steps (Telemetry only: no latent phi, no noise)
CREATE TABLE public.steps (
  episode_id       UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  t                INTEGER NOT NULL CHECK (t >= 0),
  ambient_c        DOUBLE PRECISION NOT NULL,
  load_pct         DOUBLE PRECISION NOT NULL,
  fan_pct          DOUBLE PRECISION NOT NULL,
  coolant_pct      DOUBLE PRECISION NOT NULL,
  temperature_c    DOUBLE PRECISION NOT NULL,
  pressure_bar     DOUBLE PRECISION NOT NULL,
  power_kw         DOUBLE PRECISION NOT NULL,
  vibration_mm_s   DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (episode_id, t)
);
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read steps" ON public.steps FOR SELECT TO authenticated USING (true);

-- 6. Models Registry
CREATE TABLE public.models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN
                      ('linear_gaussian','mlp_ensemble','gp','blackbox_baseline','structural_ensemble')),
  structure         TEXT NOT NULL CHECK (structure IN ('structural','blackbox','misspecified')),
  graph_version     TEXT,
  hyperparams_json  JSONB NOT NULL,
  train_dataset_id  UUID NOT NULL REFERENCES public.datasets(id),
  calibration_json  JSONB,                                      -- conformal empirical quantiles
  artifact_path     TEXT NOT NULL,
  seed              BIGINT NOT NULL,
  git_sha           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read models" ON public.models FOR SELECT TO authenticated USING (true);

-- 7. Predictions
CREATE TABLE public.predictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES public.models(id),
  user_id       UUID REFERENCES auth.users(id),
  ability       TEXT NOT NULL CHECK (ability IN
                  ('next_state','action_conditioned','intervention','counterfactual')),
  episode_id    UUID REFERENCES public.episodes(id),
  t             INTEGER,
  request_json  JSONB NOT NULL,
  assumptions   JSONB NOT NULL,                                 -- e.g. ["C1", "O1", "R1"]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_predictions_ability ON public.predictions(model_id, ability);
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read predictions" ON public.predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create predictions" ON public.predictions FOR INSERT TO authenticated WITH CHECK (true);

-- 8. Prediction Values (The Prediction Envelope)
CREATE TABLE public.prediction_values (
  prediction_id      UUID NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  horizon_step       INTEGER NOT NULL CHECK (horizon_step >= 1),
  variable           TEXT NOT NULL,
  mean               DOUBLE PRECISION NOT NULL,
  std                DOUBLE PRECISION NOT NULL CHECK (std >= 0),
  aleatoric_std      DOUBLE PRECISION CHECK (aleatoric_std IS NULL OR aleatoric_std >= 0),
  epistemic_std      DOUBLE PRECISION CHECK (epistemic_std IS NULL OR epistemic_std >= 0),
  lo_50              DOUBLE PRECISION,
  hi_50              DOUBLE PRECISION,
  lo_80              DOUBLE PRECISION,
  hi_80              DOUBLE PRECISION,
  lo_90              DOUBLE PRECISION NOT NULL,
  hi_90              DOUBLE PRECISION NOT NULL,
  lo_95              DOUBLE PRECISION,
  hi_95              DOUBLE PRECISION,
  conf_tolerance     DOUBLE PRECISION,
  conf_probability   DOUBLE PRECISION CHECK (conf_probability IS NULL OR conf_probability BETWEEN 0 AND 1),
  reliability_level  TEXT NOT NULL CHECK (reliability_level IN ('high','medium','low')),
  region_key         TEXT,
  reliability_reason TEXT,
  PRIMARY KEY (prediction_id, horizon_step, variable)
);
ALTER TABLE public.prediction_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read prediction_values" ON public.prediction_values FOR SELECT TO authenticated USING (true);

-- 9. Interventions metadata
CREATE TABLE public.interventions (
  prediction_id     UUID PRIMARY KEY REFERENCES public.predictions(id) ON DELETE CASCADE,
  target_variable   TEXT NOT NULL,
  forced_value      DOUBLE PRECISION NOT NULL,
  start_t           INTEGER NOT NULL,
  horizon           INTEGER NOT NULL CHECK (horizon >= 1),
  graph_version     TEXT NOT NULL
);
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read interventions" ON public.interventions FOR SELECT TO authenticated USING (true);

-- 10. Counterfactuals metadata
CREATE TABLE public.counterfactuals (
  prediction_id     UUID PRIMARY KEY REFERENCES public.predictions(id) ON DELETE CASCADE,
  episode_id        UUID NOT NULL REFERENCES public.episodes(id),
  change_t          INTEGER NOT NULL,
  changed_variable  TEXT NOT NULL,
  original_value    DOUBLE PRECISION NOT NULL,
  new_value         DOUBLE PRECISION NOT NULL,
  abduction_mode    TEXT NOT NULL CHECK (abduction_mode IN ('filtered_latent','oracle_latent')),
  abduction_json    JSONB                                       -- residual summary, no true noise
);
ALTER TABLE public.counterfactuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read counterfactuals" ON public.counterfactuals FOR SELECT TO authenticated USING (true);

-- 11. Predicted vs Actual Comparisons (Validation only)
CREATE TABLE public.comparisons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id  UUID NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  horizon_step   INTEGER NOT NULL,
  variable       TEXT NOT NULL,
  actual_value   DOUBLE PRECISION NOT NULL,
  error          DOUBLE PRECISION NOT NULL,
  in_interval_90 BOOLEAN NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (prediction_id, horizon_step, variable)
);
ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read comparisons" ON public.comparisons FOR SELECT TO authenticated USING (true);

-- 12. Stored Evaluations (Source of truth for all metrics)
CREATE TABLE public.evaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID NOT NULL REFERENCES public.models(id),
  ability      TEXT NOT NULL CHECK (ability IN
                 ('next_state','action_conditioned','intervention','counterfactual')),
  split        TEXT NOT NULL,                                  -- 'test','ood', etc.
  slice_key    TEXT NOT NULL DEFAULT 'all',                    -- e.g. 'horizon=10', 'regime=hot_ambient'
  metric       TEXT NOT NULL,                                  -- 'mae','rmse','nll','crps','picp_90',...
  variable     TEXT NOT NULL DEFAULT 'all',
  value        DOUBLE PRECISION NOT NULL,
  n            INTEGER NOT NULL CHECK (n > 0),
  ci_lo        DOUBLE PRECISION,
  ci_hi        DOUBLE PRECISION,
  seed         BIGINT NOT NULL,
  config_hash  TEXT NOT NULL,
  git_sha      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_evaluations_lookup ON public.evaluations(model_id, ability, split, metric);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read evaluations" ON public.evaluations FOR SELECT TO authenticated USING (true);

-- 13. Reliability Regions Map
CREATE TABLE public.reliability_regions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID NOT NULL REFERENCES public.models(id),
  region_key   TEXT NOT NULL,                                  -- e.g. 'R-014'
  bounds_json  JSONB NOT NULL,                                 -- bin edges on L, F, Ta, T
  n_train      INTEGER NOT NULL,
  mae          DOUBLE PRECISION,
  picp_90      DOUBLE PRECISION,
  level        TEXT NOT NULL CHECK (level IN ('high','medium','low')),
  reason       TEXT NOT NULL,
  UNIQUE (model_id, region_key)
);
ALTER TABLE public.reliability_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read reliability_regions" ON public.reliability_regions FOR SELECT TO authenticated USING (true);

-- 14. Causal Demonstrations (Correlation vs Causation experiments)
CREATE TABLE public.causal_demos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id               UUID REFERENCES public.models(id),
  demo_key               TEXT NOT NULL,                        -- 'thermostat_confound','vibration_effect', etc.
  description            TEXT NOT NULL,
  naive_estimate         DOUBLE PRECISION NOT NULL,
  adjusted_estimate      DOUBLE PRECISION,
  model_do_estimate      DOUBLE PRECISION NOT NULL,
  true_effect            DOUBLE PRECISION NOT NULL,
  n                      INTEGER NOT NULL,
  seed                   BIGINT NOT NULL,
  config_hash            TEXT NOT NULL,
  git_sha                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.causal_demos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read causal_demos" ON public.causal_demos FOR SELECT TO authenticated USING (true);

-- 15. AI Copilot Sessions & Incident Reports
CREATE TABLE public.ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('copilot_chat', 'incident_report', 'solution_recommendation')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own AI sessions" ON public.ai_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  structured_data JSONB,                                       -- contains cited prediction envelopes, assumptions
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own AI messages" ON public.ai_messages
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ai_sessions WHERE id = ai_messages.session_id AND user_id = auth.uid())
  );
-- 16. Multi-Tenant Architecture (Organizations, Branches, Machinery)
CREATE TABLE public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  owner_id    UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.org_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  canvas_w    INTEGER NOT NULL DEFAULT 1200,
  canvas_h    INTEGER NOT NULL DEFAULT 800,
  bg_color    TEXT NOT NULL DEFAULT '#f8fafc',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.branch_machines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  machine_type TEXT NOT NULL DEFAULT 'cooling_system',
  x            DOUBLE PRECISION NOT NULL DEFAULT 100,
  y            DOUBLE PRECISION NOT NULL DEFAULT 100,
  width        DOUBLE PRECISION NOT NULL DEFAULT 120,
  height       DOUBLE PRECISION NOT NULL DEFAULT 80,
  rotation     DOUBLE PRECISION NOT NULL DEFAULT 0,
  config_json  JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'warning', 'critical', 'offline')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.branch_machines ENABLE ROW LEVEL SECURITY;
```

---

## 4. `ground_truth` Schema (Strictly Restricted)

```sql
CREATE SCHEMA IF NOT EXISTS ground_truth;

-- Lock down schema: ONLY service_role (simulator & validator) can access
REVOKE ALL ON SCHEMA ground_truth FROM anon, authenticated;
GRANT ALL ON SCHEMA ground_truth TO service_role;

-- 1. True physical parameters of the simulator
CREATE TABLE ground_truth.true_params (
  simulator_config_id  UUID PRIMARY KEY,
  params_json          JSONB NOT NULL
);

-- 2. Complete unobserved states and exogenous noise draws
CREATE TABLE ground_truth.steps (
  episode_id              UUID NOT NULL,
  t                       INTEGER NOT NULL,
  fouling                 DOUBLE PRECISION NOT NULL,            -- latent phi_t
  true_temperature_c      DOUBLE PRECISION NOT NULL,            -- noise-free state
  true_pressure_bar       DOUBLE PRECISION NOT NULL,
  true_power_kw           DOUBLE PRECISION NOT NULL,
  true_vibration_mm_s     DOUBLE PRECISION NOT NULL,
  eps_ambient             DOUBLE PRECISION NOT NULL,
  eps_fouling             DOUBLE PRECISION NOT NULL,
  eps_temperature         DOUBLE PRECISION NOT NULL,
  eps_pressure            DOUBLE PRECISION NOT NULL,
  eps_power               DOUBLE PRECISION NOT NULL,
  eps_vibration           DOUBLE PRECISION NOT NULL,
  eps_sensor_temperature  DOUBLE PRECISION NOT NULL,
  eps_sensor_pressure     DOUBLE PRECISION NOT NULL,
  eps_sensor_power        DOUBLE PRECISION NOT NULL,
  eps_sensor_vibration    DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (episode_id, t)
);
```

---

## 5. Storage Buckets (Supabase Storage)

For bulk trajectories:
- Bucket: `simulens-datasets` (Private; access restricted to authenticated service workers).
- Path layout: `datasets/{dataset_id}/steps.parquet`.
- Metadata stored in `public.datasets`.

---

## 6. Migration Plan
1. `supabase/migrations/001_init.sql` — Schema initialization: `profiles`, `simulator_configs`, `datasets`, `episodes`, `steps`, and restricted `ground_truth` schema.
2. `supabase/migrations/002_multi_tenant.sql` — Multi-tenant hierarchy: `organizations`, `org_members`, `branches`, `branch_machines`, non-recursive RLS helper functions, and user sync triggers.
3. `supabase/migrations/003_realtime_publication.sql` — Enables `supabase_realtime` publication for `branch_machines` and `branches` for multi-screen live sync.
4. `supabase/migrations/004_alerts_ai.sql` — Creates `public.alerts` table with deterministic evidence, candidates, and AI analysis; scopes `ai_sessions` to `branch_id`; enables Realtime for `alerts`.
5. `supabase/full_schema.sql` — Complete combined idempotent SQL bundle ready for the Supabase SQL editor.

