-- =============================================================================
-- SimuLens — Migration 003: Enable Realtime for Multi-Tenant Tables
-- Challenge #44: Uncertainty-Aware Causal World Model & Simulation Engine
-- =============================================================================

-- Enable Supabase Realtime publication for multi-machine synchronization
-- This enables postgres_changes listeners on both PC1 and PC2 clients
alter publication supabase_realtime add table public.branch_machines;
alter publication supabase_realtime add table public.branches;
