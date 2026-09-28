-- =============================================================================
-- SimuLens — Migration 002_multi_tenant.sql
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
