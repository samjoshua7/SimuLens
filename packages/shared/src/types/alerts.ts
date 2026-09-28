// =============================================================================
// SimuLens — Alert & AI Copilot Data Contracts
// Pure definitions shared across frontend, gateway API, and reasoning engine
// =============================================================================

export type AlertSeverity = 'info' | 'caution' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export type AlertRuleKey =
  | 'temp_high'
  | 'temp_trend'
  | 'pressure_high'
  | 'vibration_high'
  | 'power_overload'
  | 'predicted_breach'
  | 'residual_anomaly'
  | 'machine_offline';

export interface AlertEvidence {
  metric: 'temperature_c' | 'pressure_bar' | 'vibration_mm_s' | 'power_kw';
  value: number;
  nominal: number;
  limit: number;
  margin: number; // (value - nominal) / (limit - nominal); 1.0 = at limit
  slope_per_min?: number; // simulated minutes
  minutes_to_limit?: number | null; // simulated; null if not rising towards limit
  predicted?: {
    // from engine, only when available
    horizon_steps: number;
    p_breach: number;
    first_breach_step: number | null;
    mean_at_horizon: number;
    lo_90: number;
    hi_90: number;
    reliability: 'high' | 'medium' | 'low';
    reliability_reason?: string;
  };
  window: Array<{ t: number; v: number }>; // last <= 30 samples snapshot
  actions_now: {
    machine_load: number;
    fan_speed: number;
    coolant_flow: number;
  };
  ambient_c?: number;
}

export interface InterventionCandidate {
  // Computed by reasoning-engine (Pareto search over interventions)
  id: string; // 'c1', 'c2', 'c3'
  label: string; // e.g. "Fan 60% -> 85%"
  changes: Partial<{
    machine_load: number;
    fan_speed: number;
    coolant_flow: number;
  }>;
  predicted_temp_mean: number;
  predicted_temp_lo_90: number;
  predicted_temp_hi_90: number;
  p_breach_after: number;
  power_delta_kw: number;
  reliability: 'high' | 'medium' | 'low';
}

export interface AIAnalysis {
  headline: string; // <= 80 chars
  what_is_happening: string; // <= 2 sentences, factual evidence only
  likely_causes: Array<{
    cause: string;
    kind: 'hypothesis';
    evidence_refs: string[];
  }>;
  recommended_actions: Array<{
    candidate_id: string;
    why: string;
  }>;
  urgency: 'monitor' | 'act_soon' | 'act_now';
  caveats: string[];
  source: 'llm' | 'template'; // template = deterministic fallback if LLM is slow or offline
}

export interface AlertRecord {
  id: string;
  branch_id: string;
  machine_id: string;
  rule_key: AlertRuleKey;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  evidence: AlertEvidence;
  candidates?: InterventionCandidate[] | null;
  ai_status: 'pending' | 'done' | 'fallback' | 'failed' | 'skipped';
  ai_analysis?: AIAnalysis | null;
  dedupe_key: string; // '<machine_id>:<rule_key>'
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  snoozed_until?: string | null;
  resolved_at?: string | null;
}
