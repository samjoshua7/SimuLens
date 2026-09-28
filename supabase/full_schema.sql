-- =============================================================================
-- SimuLens â€” Migration 001_init.sql
-- Two isolated schemas: public (observed/models/evals) & ground_truth (latent/physics)
-- =============================================================================

-- Ensure pgcrypto or gen_random_uuid() is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Schema: ground_truth (RESTRICTED TO SERVICE_ROLE ONLY)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS ground_truth;

-- Revoke all permissions on ground_truth schema from public, anon, and authenticated roles
REVOKE ALL ON SCHEMA ground_truth FROM PUBLIC;
REVOKE ALL ON SCHEMA ground_truth FROM anon;
REVOKE ALL ON SCHEMA ground_truth FROM authenticated;

-- True physical parameters of the simulator
CREATE TABLE IF NOT EXISTS ground_truth.physical_parameters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_hash      TEXT NOT NULL UNIQUE,
  a1_load_heat     DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  b1_fan_cool      DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  b2_coolant_cool  DOUBLE PRECISION NOT NULL DEFAULT 0.70,
  eta_t_inertia    DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  delta_fouling    DOUBLE PRECISION NOT NULL DEFAULT 0.0005,
  phi_max          DOUBLE PRECISION NOT NULL DEFAULT 0.80,
  p0_pressure      DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  p1_coolant_press DOUBLE PRECISION NOT NULL DEFAULT 0.04,
  p2_temp_press    DOUBLE PRECISION NOT NULL DEFAULT 0.08,
  w0_idle_power    DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  w1_load_power    DOUBLE PRECISION NOT NULL DEFAULT 0.18,
  w2_fan_cube      DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  w3_coolant_power DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  v0_idle_vib      DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  v1_load_vib      DOUBLE PRECISION NOT NULL DEFAULT 0.015,
  v2_fan_vib       DOUBLE PRECISION NOT NULL DEFAULT 0.010,
  v3_fouling_vib   DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Latent state trajectory and true exogenous noise draws
CREATE TABLE IF NOT EXISTS ground_truth.episodes_latent (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  UUID NOT NULL, -- references public.episodes(id) once created
  seed        BIGINT NOT NULL,
  config_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS ground_truth.steps_latent (
  episode_id    UUID NOT NULL,
  t             INTEGER NOT NULL CHECK (t >= 0),
  fouling_phi   DOUBLE PRECISION NOT NULL CHECK (fouling_phi BETWEEN 0 AND 1),
  eps_ambient   DOUBLE PRECISION NOT NULL,
  eps_temp      DOUBLE PRECISION NOT NULL,
  eps_pressure  DOUBLE PRECISION NOT NULL,
  eps_power     DOUBLE PRECISION NOT NULL,
  eps_vibration DOUBLE PRECISION NOT NULL,
  eps_fouling   DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (episode_id, t)
);

-- =============================================================================
-- 2. Schema: public (Observed Telemetry, Models, Predictions, Evaluations, AI)
-- =============================================================================

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('engineer', 'admin', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 2. Simulator Configurations (observed side)
CREATE TABLE IF NOT EXISTS public.simulator_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       TEXT NOT NULL,
  version      TEXT NOT NULL,
  config_hash  TEXT NOT NULL UNIQUE,
  config_json  JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.simulator_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read configs" ON public.simulator_configs FOR SELECT USING (true);

-- 3. Datasets Registry
CREATE TABLE IF NOT EXISTS public.datasets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,
  simulator_config_id  UUID NOT NULL REFERENCES public.simulator_configs(id),
  seed                 BIGINT NOT NULL,
  n_episodes           INTEGER NOT NULL,
  storage_path         TEXT,
  git_sha              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read datasets" ON public.datasets FOR SELECT USING (true);

-- 4. Observed Episodes
CREATE TABLE IF NOT EXISTS public.episodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  seed          BIGINT NOT NULL,
  policy_type   TEXT NOT NULL CHECK (policy_type IN
                  ('observational','randomized','confounded_hidden','ood_stress','scripted_demo')),
  regime        TEXT NOT NULL DEFAULT 'nominal',
  split         TEXT NOT NULL CHECK (split IN ('train','calibration','val','test','ood')),
  n_steps       INTEGER NOT NULL CHECK (n_steps > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_episodes_dataset_split ON public.episodes(dataset_id, split);
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read episodes" ON public.episodes FOR SELECT USING (true);

-- 5. Observed Steps
CREATE TABLE IF NOT EXISTS public.steps (
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
CREATE POLICY "Public read steps" ON public.steps FOR SELECT USING (true);

-- 6. Models Registry
CREATE TABLE IF NOT EXISTS public.models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN
                      ('linear_gaussian','mlp_ensemble','gp','blackbox_baseline','structural_ensemble')),
  structure         TEXT NOT NULL CHECK (structure IN ('structural','blackbox','misspecified')),
  graph_version     TEXT,
  hyperparams_json  JSONB NOT NULL,
  train_dataset_id  UUID NOT NULL REFERENCES public.datasets(id),
  calibration_json  JSONB,
  artifact_path     TEXT NOT NULL,
  seed              BIGINT NOT NULL,
  git_sha           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read models" ON public.models FOR SELECT USING (true);

-- 7. Predictions
CREATE TABLE IF NOT EXISTS public.predictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES public.models(id),
  user_id       UUID,
  ability       TEXT NOT NULL CHECK (ability IN
                  ('next_state','action_conditioned','intervention','counterfactual')),
  episode_id    UUID REFERENCES public.episodes(id),
  t             INTEGER,
  request_json  JSONB NOT NULL,
  assumptions   JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_predictions_ability ON public.predictions(model_id, ability);
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read predictions" ON public.predictions FOR SELECT USING (true);
CREATE POLICY "Users can create predictions" ON public.predictions FOR INSERT WITH CHECK (true);

-- 8. Prediction Values (Prediction Envelope)
CREATE TABLE IF NOT EXISTS public.prediction_values (
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
CREATE POLICY "Public read prediction_values" ON public.prediction_values FOR SELECT USING (true);

-- 9. Interventions Metadata
CREATE TABLE IF NOT EXISTS public.interventions (
  prediction_id     UUID PRIMARY KEY REFERENCES public.predictions(id) ON DELETE CASCADE,
  target_variable   TEXT NOT NULL,
  forced_value      DOUBLE PRECISION NOT NULL,
  start_t           INTEGER NOT NULL,
  horizon           INTEGER NOT NULL CHECK (horizon >= 1),
  graph_version     TEXT NOT NULL
);
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read interventions" ON public.interventions FOR SELECT USING (true);

-- 10. Counterfactuals Metadata
CREATE TABLE IF NOT EXISTS public.counterfactuals (
  prediction_id     UUID PRIMARY KEY REFERENCES public.predictions(id) ON DELETE CASCADE,
  episode_id        UUID NOT NULL REFERENCES public.episodes(id),
  change_t          INTEGER NOT NULL,
  changed_variable  TEXT NOT NULL,
  original_value    DOUBLE PRECISION NOT NULL,
  new_value         DOUBLE PRECISION NOT NULL,
  abduction_mode    TEXT NOT NULL CHECK (abduction_mode IN ('filtered_latent','oracle_latent')),
  abduction_json    JSONB
);
ALTER TABLE public.counterfactuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read counterfactuals" ON public.counterfactuals FOR SELECT USING (true);

-- 11. Predicted vs Actual Comparisons
CREATE TABLE IF NOT EXISTS public.comparisons (
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
CREATE POLICY "Public read comparisons" ON public.comparisons FOR SELECT USING (true);

-- 12. Stored Evaluations (Source of truth for all metrics)
CREATE TABLE IF NOT EXISTS public.evaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID NOT NULL REFERENCES public.models(id),
  ability      TEXT NOT NULL CHECK (ability IN
                 ('next_state','action_conditioned','intervention','counterfactual')),
  split        TEXT NOT NULL,
  slice_key    TEXT NOT NULL DEFAULT 'all',
  metric       TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_evaluations_lookup ON public.evaluations(model_id, ability, split, metric);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read evaluations" ON public.evaluations FOR SELECT USING (true);

-- 13. Reliability Regions Map
CREATE TABLE IF NOT EXISTS public.reliability_regions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID NOT NULL REFERENCES public.models(id),
  region_key   TEXT NOT NULL,
  bounds_json  JSONB NOT NULL,
  n_train      INTEGER NOT NULL,
  mae          DOUBLE PRECISION,
  picp_90      DOUBLE PRECISION,
  level        TEXT NOT NULL CHECK (level IN ('high','medium','low')),
  reason       TEXT NOT NULL,
  UNIQUE (model_id, region_key)
);
ALTER TABLE public.reliability_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read reliability_regions" ON public.reliability_regions FOR SELECT USING (true);

-- 14. Experiments Model (Top-level runnable experiment registry)
CREATE TABLE IF NOT EXISTS public.experiments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID,
  name                  TEXT NOT NULL,
  description           TEXT,
  initial_state         JSONB NOT NULL,
  actions               JSONB NOT NULL,
  environment           JSONB NOT NULL,
  seed                  BIGINT NOT NULL,
  predicted_trajectory  JSONB NOT NULL,
  actual_trajectory     JSONB,
  intervention          JSONB,
  counterfactual        JSONB,
  uncertainty           JSONB NOT NULL,
  metrics               JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read experiments" ON public.experiments FOR SELECT USING (true);
CREATE POLICY "Users can create experiments" ON public.experiments FOR INSERT WITH CHECK (true);

-- 15. AI Copilot Sessions & Reports
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  title       TEXT NOT NULL DEFAULT 'SimuLens Session',
  context_ref JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own AI sessions" ON public.ai_sessions FOR SELECT USING (true);
CREATE POLICY "Users can insert own AI sessions" ON public.ai_sessions FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  structured_intent JSONB,
  citations   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view AI messages" ON public.ai_messages FOR SELECT USING (true);
CREATE POLICY "Users can insert AI messages" ON public.ai_messages FOR INSERT WITH CHECK (true);
-- =============================================================================
-- SimuLens â€” Migration 002_multi_tenant.sql
-- Multi-tenant: Organizations, Branches, Machinery Placements, Auth Trigger
-- =============================================================================

-- =============================================================================
-- 1. Auto-create profile on Supabase Auth signup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), public.profiles.avatar_url);
  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth.users into public.profiles
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
  id,
  COALESCE(email, ''),
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''),
  COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture', '')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
  avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), public.profiles.avatar_url);


-- =============================================================================
-- 2. Organizations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  owner_id    UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Organization Members
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.org_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL,
  role      TEXT NOT NULL DEFAULT 'member'
            CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Auto-add organization creator as owner member
CREATE OR REPLACE FUNCTION public.handle_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created ON public.organizations;
CREATE TRIGGER on_org_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_org();


-- =============================================================================
-- Helper Functions for Non-Recursive RLS checks
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND user_id = p_user_id
    UNION
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND user_id = p_user_id AND role IN ('owner', 'admin')
    UNION
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_id = p_user_id
  );
$$;

-- Organization Policies
DROP POLICY IF EXISTS "Members can view their orgs" ON public.organizations;
CREATE POLICY "Members can view their orgs"
  ON public.organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_org_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can update org" ON public.organizations;
CREATE POLICY "Owner can update org"
  ON public.organizations FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can delete org" ON public.organizations;
CREATE POLICY "Owner can delete org"
  ON public.organizations FOR DELETE
  USING (auth.uid() = owner_id);

-- Org Members Policies
DROP POLICY IF EXISTS "Members can view org members" ON public.org_members;
CREATE POLICY "Members can view org members"
  ON public.org_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_org_member(org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can add members" ON public.org_members;
CREATE POLICY "Admins can add members"
  ON public.org_members FOR INSERT
  WITH CHECK (
    public.is_org_admin(org_id, auth.uid())
    OR org_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can remove members" ON public.org_members;
CREATE POLICY "Admins can remove members"
  ON public.org_members FOR DELETE
  USING (
    public.is_org_admin(org_id, auth.uid())
  );

-- =============================================================================
-- 4. Branches / Offices
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  canvas_w    INTEGER NOT NULL DEFAULT 1200,
  canvas_h    INTEGER NOT NULL DEFAULT 800,
  bg_color    TEXT NOT NULL DEFAULT '#f8fafc',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_branches_org ON public.branches(org_id);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view branches" ON public.branches;
CREATE POLICY "Org members can view branches"
  ON public.branches FOR SELECT
  USING (
    public.is_org_member(org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can create branches" ON public.branches;
CREATE POLICY "Admins can create branches"
  ON public.branches FOR INSERT
  WITH CHECK (
    public.is_org_admin(org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update branches" ON public.branches;
CREATE POLICY "Admins can update branches"
  ON public.branches FOR UPDATE
  USING (
    public.is_org_admin(org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete branches" ON public.branches;
CREATE POLICY "Admins can delete branches"
  ON public.branches FOR DELETE
  USING (
    public.is_org_admin(org_id, auth.uid())
  );

-- =============================================================================
-- 5. Machinery Placements on Branch Floor Plans
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.branch_machines (
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
  status       TEXT NOT NULL DEFAULT 'idle'
               CHECK (status IN ('idle', 'running', 'warning', 'critical', 'offline')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_branch_machines_branch ON public.branch_machines(branch_id);

ALTER TABLE public.branch_machines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view machines" ON public.branch_machines;
CREATE POLICY "Org members can view machines"
  ON public.branch_machines FOR SELECT
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can create machines" ON public.branch_machines;
CREATE POLICY "Members can create machines"
  ON public.branch_machines FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can update machines" ON public.branch_machines;
CREATE POLICY "Members can update machines"
  ON public.branch_machines FOR UPDATE
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can delete machines" ON public.branch_machines;
CREATE POLICY "Admins can delete machines"
  ON public.branch_machines FOR DELETE
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_admin(b.org_id, auth.uid())
    )
  );

-- =============================================================================
-- 6. Update profiles RLS to let users read/update their own profile
-- =============================================================================
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service can insert profiles" ON public.profiles;
CREATE POLICY "Service can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);
