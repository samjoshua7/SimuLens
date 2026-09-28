# SimuLens — AI Copilot & Automatic Alert System: Implementation Plan

Audience: the coding agent that will execute this. Read `AGENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `HANDOVER.md` first. Execute phase by phase. Do not skip ahead. Update `HANDOVER.md` after each phase.

## 0. Goal

A right-side **AI dock** in the dashboard that (1) shows alerts created automatically as machines approach or enter dangerous states, (2) explains each one in plain language the instant it happens, (3) recommends fixes that were **computed by the causal engine**, and (4) works as a chat copilot. On the floor plan, each machine shows its own warning/caution callout.

### Non-negotiable principles
1. **The LLM never produces a number that is shown as a prediction, threshold, or recommendation value.** All numbers come from telemetry, thresholds, or the reasoning engine. The LLM explains, prioritises, and phrases (repo rule: LLM is an interface layer only).
2. **Two-speed alerts.** Detection is deterministic and instant (0 LLM calls). AI enrichment arrives async and upgrades the same alert in place. If OpenRouter fails or is slow, the deterministic message and a deterministic explanation template still work (demo safety).
3. **Every predictive statement carries uncertainty and a reliability level** (reuse `PredictionEnvelope` and `OperatingRegionEvaluator`).
4. **Human in the loop.** The AI suggests; the user clicks "Apply". No autonomous actuation in this plan.
5. **Alerts must not spam.** Debounce, dedupe, hysteresis, cooldown, and an AI call budget are required, not optional.

## 1. Verified findings about the current repo (do not re-guess; re-verify if the code changed)

| # | Finding | Consequence |
|---|---|---|
| F1 | `apps/api` has **no auth**: `/api/ai/*`, `/api/prediction/*` are open and CORS is `origin: true`. `apps/web/src/lib/api.ts` sends no `Authorization` header. | Anyone with the URL can burn OpenRouter credits. Phase 0 must add JWT verification and rate limits before AI goes live. |
| F2 | Telemetry currently lives only as **latest values** in `branch_machines.config_json.current_telemetry`, plus a Supabase broadcast on channel `branch_sync_<branchId>` (event `telemetry_sync`). No history is stored. | Trend/anomaly detection needs a per-machine ring buffer on the client. |
| F3 | Values change only when a slider moves or "Run Causal Rollout" is clicked. Slider values come from an inline formula in `simulation/page.tsx` (`ambient + loadHeat - fanCool ...`), **not** the engine. Status `warning` uses a hard-coded 85 °C. | Alerts would be static. Phase 0 adds a live tick loop that steps the real simulator and removes hard-coded limits. |
| F4 | `MachineNode.tsx` only has `isOverTemp` (temp > max_temp) and a hovercard warning. No severity levels, no on-map callout. | Add a severity model and callouts. |
| F5 | The engine (`@simulens/simulation-engine`, `world-model`, `reasoning-engine`) is calibrated to **one domain: the cooling system** (`COOLING_SYSTEM_CONSTANTS`). Other machine types (`chiller`, `boiler`, `compressor`, ...) exist only as presets in `apps/web/src/types/machinery.ts`. | Predictive alerts are only valid for `cooling_system`. See decision D1 for other types. |
| F6 | `OperatingRegionEvaluator.assess()` already returns reliability (`high/medium/low`) and OOD reasons. `PredictionEnvelope` already carries aleatoric/epistemic std and 50/80/90/95 intervals. | Reuse both; do not invent new uncertainty code. |
| F7 | Existing `ai_sessions` / `ai_messages` tables have `USING (true)` RLS and no `branch_id`. `supabase_realtime` publication is never altered in the SQL. | Migration 003 must tighten RLS and enable Realtime for `alerts` and `branch_machines`. |
| F8 | `AIService.interpretQuery` already does NL → structured intent via OpenRouter with a regex fallback, and validates output. | Extend this pattern; keep the fallback approach. |
| F9 | `apps/web` depends only on `@simulens/shared`. Vercel builds only `shared`. | Client-side detection code must live in `packages/shared` (pure functions, no other deps). Engine-dependent logic stays in `reasoning-engine` (server). |
| F10 | One engine step = `DT_SECONDS = 30` simulated seconds. | The UI tick needs a stated time-compression factor and must label times as "simulated". |

## 2. Target architecture

```
PC2 controller (sliders / auto tick) ──telemetry──▶ Supabase broadcast + branch_machines
                                                          │
                     ┌────────────────────────────────────┴─────────────┐
                     ▼                                                  ▼
             floor plan page (PC1)                              simulation page (PC2)
      useTelemetryBuffer (ring buffer 120/machine)       (same hooks; both may detect)
                     │
   shared/alerts  evaluateRules()  ← instant, deterministic, per-machine thresholds
                     │  candidate alerts
                     ▼
      upsert into public.alerts (unique dedupe_key while not resolved) ─▶ Realtime ─▶ all clients
                     │
                     ├─▶ machine callouts + severity ring (MachineNode)
                     ├─▶ AI dock: Alerts tab (deterministic text shown immediately)
                     └─▶ POST /api/advisor/assess   (engine only: breach probability + candidate fixes)
                                   │
                                   ▼
                    POST /api/ai/alert-analysis  (OpenRouter, JSON schema, validated)
                                   │
                                   ▼
                     update alerts.ai_analysis + candidates  ─▶ Realtime ─▶ card upgrades in place
```

Double detection from two open pages is safe: the unique partial index makes the second insert fail silently.

## 3. Data contracts (add to `packages/shared/src/types/alerts.ts`, export from `index.ts`)

```ts
export type AlertSeverity = 'info' | 'caution' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type AlertRuleKey =
  | 'temp_high' | 'temp_trend' | 'pressure_high' | 'vibration_high'
  | 'power_overload' | 'predicted_breach' | 'residual_anomaly' | 'machine_offline';

export interface AlertEvidence {
  metric: 'temperature_c' | 'pressure_bar' | 'vibration_mm_s' | 'power_kw';
  value: number; nominal: number; limit: number;
  margin: number;                       // (value-nominal)/(limit-nominal); 1.0 = at limit
  slope_per_min?: number;               // simulated minutes
  minutes_to_limit?: number | null;     // simulated; null if not rising
  predicted?: {                         // from engine, only when available
    horizon_steps: number; p_breach: number; first_breach_step: number | null;
    mean_at_horizon: number; lo_90: number; hi_90: number;
    reliability: 'high' | 'medium' | 'low'; reliability_reason?: string;
  };
  window: Array<{ t: number; v: number }>;   // last <= 30 samples snapshot
  actions_now: { machine_load: number; fan_speed: number; coolant_flow: number };
  ambient_c?: number;
}

export interface InterventionCandidate {          // computed by reasoning-engine
  id: string;                                     // 'c1','c2','c3'
  label: string;                                  // e.g. "Fan 60% -> 85%"
  changes: Partial<{ machine_load: number; fan_speed: number; coolant_flow: number }>;
  predicted_temp_mean: number; predicted_temp_lo_90: number; predicted_temp_hi_90: number;
  p_breach_after: number; power_delta_kw: number;
  reliability: 'high' | 'medium' | 'low';
}

export interface AIAnalysis {
  headline: string;                                // <= 80 chars
  what_is_happening: string;                       // <= 2 sentences, evidence only
  likely_causes: Array<{ cause: string; kind: 'hypothesis'; evidence_refs: string[] }>;
  recommended_actions: Array<{ candidate_id: string; why: string }>;
  urgency: 'monitor' | 'act_soon' | 'act_now';
  caveats: string[];
  source: 'llm' | 'template';                      // template = deterministic fallback
}
```

## 4. Migration `supabase/migrations/003_alerts_ai.sql` (present to the user before applying; also append to `supabase/full_schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS public.alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  machine_id    UUID NOT NULL REFERENCES public.branch_machines(id) ON DELETE CASCADE,
  rule_key      TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','caution','warning','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,                       -- deterministic, shown instantly
  evidence      JSONB NOT NULL DEFAULT '{}',
  candidates    JSONB,                               -- engine-computed interventions
  ai_status     TEXT NOT NULL DEFAULT 'pending'
                CHECK (ai_status IN ('pending','done','fallback','failed','skipped')),
  ai_analysis   JSONB,
  dedupe_key    TEXT NOT NULL,                       -- '<machine_id>:<rule_key>'
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID, acknowledged_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ, resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_open ON public.alerts(dedupe_key) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_alerts_branch ON public.alerts(branch_id, status, severity, last_seen_at DESC);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
-- SELECT / INSERT / UPDATE: org members only (same pattern as branch_machines via public.is_org_member).
-- DELETE: admins only.

-- Chat tables: scope to branch + owner, replace the USING (true) policies.
ALTER TABLE public.ai_sessions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS tool_results JSONB;
-- Drop the old "Users can view/insert ..." policies on ai_sessions and ai_messages; recreate as
-- user_id = auth.uid() AND branch member (messages: via their session).

-- Realtime (guard so re-running does not error)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='alerts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='branch_machines') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_machines; END IF;
END $$;
```

## 5. Severity & detection rules (defaults; all are **assumptions**, tunable via `branch_machines.config_json.thresholds`; never present them as industry standards)

Let `margin = (value - nominal) / (limit - nominal)` using the machine preset (`MACHINERY_CATALOG.specs`) or per-machine overrides.

| Rule | caution | warning | critical |
|---|---|---|---|
| `temp_high` | margin >= 0.60 | margin >= 0.85 | margin >= 1.00 |
| `pressure_high` | margin >= 0.60 | margin >= 0.85 | margin >= 1.00 |
| `vibration_high` (ratio = v / nominal_vib) | ratio >= 2.0 | ratio >= 3.0 | ratio >= 4.5 |
| `power_overload` (ratio = kW / rated) | ratio >= 1.00 | ratio >= 1.15 | ratio >= 1.30 |
| `temp_trend` | rising and `minutes_to_limit` <= 15 | <= 8 | <= 3 |
| `predicted_breach` (engine) | p_breach >= 0.20 within 10 steps | >= 0.50 | >= 0.80 or breach within 3 steps |

Lifecycle rules:
- **Debounce:** open only after 2 consecutive samples in the state (sensor noise is real).
- **Escalation:** severity increase updates the same alert (`last_seen_at`, `severity`, re-trigger AI enrichment); it does not create a new row.
- **Hysteresis / auto-resolve:** resolve after 5 consecutive samples below (threshold − 5% of margin). Set `resolved_at`.
- **Cooldown:** a resolved rule cannot re-open within 60 s.
- **Snooze:** user snooze 5 min suppresses UI badge and sound, not detection.
- **Machine status sync:** highest open severity maps to `branch_machines.status` (`critical`→`critical`, `warning`→`warning`, else `running`). Do not override `offline`/`idle` set by the user.
- **AI budget:** max 1 enrichment per alert per severity level; global cap `AI_MAX_CALLS_PER_MIN` (default 12); identical evidence hash is cached for 60 s.

## 6. Phases

### Phase 0 — Foundations (must finish before any AI call goes public)
**Goal:** secure the API, make telemetry live and meaningful, get history.
Tasks:
1. `apps/api`: add `@fastify/rate-limit` (per IP + per user) and an `auth` preHandler that reads `Authorization: Bearer <supabase access token>` and validates it with the service-role client (`supabase.auth.getUser(token)`). Apply to `/api/ai/*`, `/api/advisor/*`, `/api/prediction/*`, `/api/intervention/*`, `/api/counterfactual/*`, `/api/simulation/*`. Keep `/health` open. Restrict CORS to `API_CORS_ORIGIN` list (comma separated) in production. Set body size limit.
2. `apps/web/src/lib/api.ts`: attach the session access token to every request.
3. Add `POST /api/simulation/step-batch` (array of `{machineId, state, action, environment}` → array of observed steps) so one tick costs one request.
4. `apps/web/src/lib/telemetryBuffer.ts`: per-machine ring buffer (max 120 samples) fed by realtime broadcast and local ticks. Export `getWindow(machineId, n)`.
5. **Live tick loop** on the simulation page: every `TICK_MS` (default 2000) call `step-batch` for all machines with `status` running/warning/critical, using the current slider actions; broadcast + persist telemetry (throttle DB writes to once per 5 s per machine, broadcast every tick). Add a "Live sim: ON/OFF" toggle. Replace the inline slider formula and the hard-coded `85` threshold.
6. Use **one persistent** Supabase channel per page (create once, subscribe, reuse for `send`) instead of creating a channel on every slider tick. Debounce slider-driven writes (250 ms).
7. Migration 003 (Section 4): present to the user, wait for confirmation that it was applied.
Time compression: `TICK_MS` wall time = 1 engine step (`DT_SECONDS` = 30 s simulated). All UI times are labelled "sim-min".
**Acceptance:** unauthenticated `curl` to `/api/ai/interpret` returns 401; two browsers show the same machine values changing every tick; no channel leak (channel count stays constant while dragging sliders).

### Phase 1 — Detection engine + on-map warnings
**Goal:** alerts appear instantly and machines visibly warn.
Tasks:
1. `packages/shared/src/alerts/`: `types` (Section 3), `thresholds.ts` (defaults from Section 5 + override merge), `evaluate.ts` exporting pure `evaluateMachineRules({machine, spec, window, actions, ambient}) → CandidateAlert[]` (severity, rule_key, title, deterministic `message`, evidence). Include slope + `minutes_to_limit` (least-squares over last 12 samples). Unit tests with `node --test` (noise flapping, escalation, hysteresis, offline machines, missing telemetry).
2. `apps/web/src/hooks/useAlertEngine.ts`: on telemetry update, evaluate rules, apply debounce/cooldown state machine, upsert into `alerts` (ignore unique-violation), auto-resolve, sync `branch_machines.status`.
3. `apps/web/src/hooks/useAlertsRealtime.ts`: initial fetch of open alerts for the branch + Realtime subscription (INSERT/UPDATE) → store in a small `alertStore`.
4. `MachineNode.tsx`: severity ring (caution amber, warning orange, critical red pulsing), corner badge with icon **and text** (never colour-only), and an anchored callout above the node with the highest-severity alert `title` + `minutes_to_limit` (e.g. "Overheating in ~6 sim-min"). Hover card lists all open alerts for the machine. Remove the local-only `isOverTemp` logic in favour of alert state.
5. `OfficeStatsBar.tsx`: counts per severity + "AI online/degraded" pill.
**Acceptance:** setting a cooling tower to load 100 / fan 10 / coolant 10 produces caution → warning → critical on the map with no LLM involved; reducing load resolves the alert automatically; reload keeps alerts.

### Phase 2 — Right-side AI dock (Alerts tab)
Tasks:
1. `apps/web/src/components/ai/AIPanel.tsx`: right dock, collapsible, width 360–440 px, state remembered in localStorage, tabs **Alerts | Copilot | Brief** (Copilot/Brief stubbed until later phases). Mount in `dashboard/[orgSlug]/[branchId]/page.tsx` as the right flex child; on `simulation/page.tsx` mount the same panel as a right drawer so the controller PC sees consequences.
2. `AlertFeed.tsx` + `AlertCard.tsx`: sort by severity then recency; group by machine; filter chips (All / Open / Critical / Acknowledged); unread badge on the collapsed dock button; each card shows severity chip, machine, "opened 2 sim-min ago", the deterministic message, and an **AI analysis** area with a skeleton while `ai_status = 'pending'`.
3. Card actions: **Acknowledge**, **Snooze 5 min**, **Focus on map** (reuse `handleFocusMachine`), **Ask AI about this** (opens Copilot with the alert as context), **Apply** (Phase 3).
4. Optional toggles: sound on critical, browser notification on critical.
**Acceptance:** a critical alert appears in the dock within one tick of the machine turning red; ack/snooze persist across reload and sync to the other PC.

### Phase 3 — Advisor (engine) + AI analysis (LLM) + Apply
Tasks:
1. `packages/reasoning-engine/src/advisor/recommender.ts`: `Recommender.search({state, action, environment, limits, horizon=10})`. Grid over `fan_speed` (+10…+40), `coolant_flow` (+10…+40), `machine_load` (−10…−40) and pairwise combinations within `PHYSICAL_LIMITS`. Roll each through `ActionConditionedPredictor`. Score = P(temp > limit) from the envelope Normal approximation + normalised power cost + reliability penalty. Return the top 3 as `InterventionCandidate` (Pareto: safest, cheapest, balanced). Every candidate carries its envelope interval and reliability. Tests: candidates never exceed physical limits; worse states never rank above better ones; deterministic for a given input.
2. `apps/api/src/routes/advisor.ts`: `POST /api/advisor/assess` → `{ predicted: {...evidence.predicted}, candidates: InterventionCandidate[] }`. Only valid for machine types the engine supports (see D1); otherwise respond `{ supported: false }` and the client skips the predictive part.
3. `apps/api/src/services/openrouter.ts`: small client with `AbortController` timeout (8 s), one retry, JSON mode, model from `OPENROUTER_MODEL`, optional `OPENROUTER_FALLBACK_MODEL`. Refactor `AIService` to use it.
4. `POST /api/ai/alert-analysis`: input = alert evidence + machine spec + candidates. Build the prompt from a **facts block** (JSON of allowed numbers). Ask for the `AIAnalysis` JSON. Post-validate: (a) JSON schema; (b) every `candidate_id` exists; (c) every number in free text must match a value in the facts block (tolerance 0.05 or rounding); on any failure use the **template fallback** (`source: 'template'`) built from evidence. Never let the LLM invent limits or predictions.
5. Client flow: on new/escalated alert → call `/advisor/assess` (if supported) → write `candidates` and `evidence.predicted` → call `/ai/alert-analysis` → write `ai_analysis`, `ai_status`. Respect the AI budget rules in Section 5.
6. **Apply** button on a recommended action: confirmation dialog showing the exact changes and the predicted outcome with its 90% interval, then set the machine's control values through the same path as the sliders (single persistent channel + DB write), and log the action in the alert timeline. After applying, the card shows "Verifying…" and compares the next 10 real ticks with the prediction ("predicted 78.4 °C [75.1–81.6], observed 79.0 °C ✓ inside 90% interval") — this is the prediction-vs-actual story for the judges.
**System prompt for alert analysis (contract):**
> You are SimuLens Ops Analyst. You explain a machine alert to a plant operator. Use ONLY the facts provided. Never state a number that is not in FACTS. Never invent causes as facts; list causes as hypotheses tied to evidence refs. Recommend actions ONLY by `candidate_id` from CANDIDATES. Prefer plain, calm language. If reliability is low, say so in `caveats`. Output strictly the JSON schema.
**Acceptance:** a critical overheat alert shows deterministic text immediately, then within ~5 s an AI headline, hypotheses, and up to 3 actions with predicted outcomes; killing the OpenRouter key still yields a template explanation; Apply visibly cools the machine and the verification line appears.

### Phase 4 — Copilot chat
Tasks:
1. `CopilotChat.tsx` in the AI dock: message list, input, suggestion chips ("Which machine is riskiest?", "What if I set fan to 100%?", "Why did Cooling Tower 01 go critical?", "Summarise this floor"). Persist sessions in `ai_sessions`/`ai_messages` (branch-scoped).
2. `POST /api/ai/chat` (3-step pipeline, works with any model, no native tool-calling required):
   1. **Parse** the message to a structured request (extend `StructuredAIResponse` intents: `status`, `explain_alert`, `intervention`, `compare`, `counterfactual`, `summary`), with the existing regex fallback.
   2. **Execute** with engine/DB tools: machine status from client-supplied snapshot, open alerts, `Recommender`, `InterventionPredictor`, counterfactual on stored episodes if available.
   3. **Narrate**: LLM writes the answer from the tool results using the same facts-block + number validation. Return `{ reply, structured_request, engine_results, citations }`.
3. Render engine results inline: a compact Recharts band chart (mean + 90% interval) for interventions; "Apply this" button reusing Phase 3.
4. Context passed with each message: selected machine id, open alerts (ids + evidence summary), last 30 samples of the selected machine. Enforce a max context size.
5. Streaming (SSE) as an upgrade once non-streaming works.
**Acceptance:** "What if I set the fan to 100% on Cooling Tower 01?" runs a real `do()` prediction and answers with the interval and reliability; questions outside the domain get a polite refusal to guess numbers.

### Phase 5 — Incident correlation, branch brief, anomaly detection, polish
Tasks:
1. **Residual anomaly** rule (`residual_anomaly`): keep the last engine prediction per machine; if the next observed value falls outside its 95% interval for 3 consecutive ticks, raise a caution ("behaving unlike the model's expectation"). This flags drift, sensor faults, and the latent fouling case. Cooling-system machines only unless D1 says otherwise.
2. **Incident grouping:** if >= 2 machines open alerts within 60 s, create a parent `incident` view in the dock (no new table required for MVP: group client-side by time window) and ask the LLM for one combined summary (facts-block validated).
3. **Brief tab:** `POST /api/ai/branch-brief` → 3–5 bullet floor summary (worst machine, trend, top recommended action), refreshed every 60 s or on demand.
4. Polish: empty states, error states, loading skeletons, keyboard focus, `aria-live="polite"` for new alerts, reduced-motion support, mobile layout for the dock.
5. Demo script in `docs/DEMO_SCRIPT.md`: normal → raise load → caution → warning → AI analysis → Apply → recovery → residual anomaly.
**Acceptance:** whole demo script runs without errors on the deployed Vercel + Render + Supabase stack.

## 7. Environment additions (document in `.env.example`; set on Render only)

| Key | Default | Purpose |
|---|---|---|
| `OPENROUTER_FALLBACK_MODEL` | unset | second model if the first fails |
| `AI_ENABLED` | `true` | kill switch |
| `AI_MAX_CALLS_PER_MIN` | `12` | global LLM budget |
| `API_CORS_ORIGIN` | Vercel URL(s) | now actually used |
| `NEXT_PUBLIC_TICK_MS` | `2000` | live loop interval (Vercel) |

## 8. Testing checklist
- `shared`: rule evaluation unit tests (flapping, escalation, hysteresis, cooldown, missing telemetry, offline).
- `reasoning-engine`: recommender tests (limits, ordering, determinism).
- `api`: auth 401/200, rate limit, `alert-analysis` validator rejects a response containing an unlisted number, template fallback when OpenRouter times out.
- Web: manual demo script; verify no duplicated alerts with two browsers open; verify no realtime channel leak.
- `npm run build` for `shared`, `api`, and `web` must pass. Never weaken existing tests.

## 9. Decisions (defaults apply unless the user overrides)
- **D1 — Non-cooling machine types** (chiller, boiler, compressor, ...): default = threshold, trend, and status alerts only, labelled "rule-based". Predictive and recommender features run for `cooling_system` only, because the engine is calibrated only to that domain. Alternative (not default): a normalised transfer twin with reliability capped at `medium` and an explicit "approximate" label.
- **D2 — Authority:** AI explains and recommends; the user applies. No autopilot.
- **D3 — Notifications:** in-app only (optional sound / browser notification toggles).
- **D4 — Time:** 1 tick = 1 engine step = 30 sim-seconds; UI labels "sim-min".

## 10. Agent working rules for this plan
- One phase per session. Finish, run checks, update `HANDOVER.md`, then stop and report.
- Human Terminal Rule: do not run long dev servers/builds and wait; print the command and ask the user.
- Database-First Rule: present migration 003 and wait for confirmation before touching dependent code.
- Any new stored or displayed metric must trace to real engine output; never hard-code demo numbers.
