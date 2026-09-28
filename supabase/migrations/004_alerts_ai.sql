-- =============================================================================
-- SimuLens — Migration 004: AI Copilot & Automatic Alert System
-- Real-time deterministic detection, causal reasoning advisor, and LLM explainer
-- =============================================================================

-- =============================================================================
-- 1. Create public.alerts Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  machine_id      UUID NOT NULL REFERENCES public.branch_machines(id) ON DELETE CASCADE,
  rule_key        TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'caution', 'warning', 'critical')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,                       -- Deterministic, shown immediately (0 LLM latency)
  evidence        JSONB NOT NULL DEFAULT '{}',
  candidates      JSONB,                               -- Causal engine computed interventions
  ai_status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (ai_status IN ('pending', 'done', 'fallback', 'failed', 'skipped')),
  ai_analysis     JSONB,
  dedupe_key      TEXT NOT NULL,                       -- '<machine_id>:<rule_key>'
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ
);

-- =============================================================================
-- 2. Indexes: Single Open Alert per Machine/Rule & Fast Branch Queries
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_open 
  ON public.alerts(dedupe_key) 
  WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS idx_alerts_branch 
  ON public.alerts(branch_id, status, severity, last_seen_at DESC);

-- =============================================================================
-- 3. Row Level Security for Alerts
-- =============================================================================
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view alerts" ON public.alerts;
CREATE POLICY "Org members can view alerts"
  ON public.alerts FOR SELECT
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can insert alerts" ON public.alerts;
CREATE POLICY "Org members can insert alerts"
  ON public.alerts FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can update alerts" ON public.alerts;
CREATE POLICY "Org members can update alerts"
  ON public.alerts FOR UPDATE
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE public.is_org_member(b.org_id, auth.uid())
    )
  );

-- =============================================================================
-- 4. Scope Chat Tables (ai_sessions, ai_messages) to Branch and Members
-- =============================================================================
ALTER TABLE public.ai_sessions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS tool_results JSONB;

-- =============================================================================
-- 5. Realtime Publication Guard for Alerts
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='alerts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;
END $$;
