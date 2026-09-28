'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  GitBranch,
  Gauge,
  History,
  Play,
  RotateCcw,
  Sliders,
  Zap,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Thermometer,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sun,
  Moon,
  Wind,
  Droplets,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  TelemetryStep,
  PredictionEnvelope,
  InterventionSpec,
  CounterfactualSpec,
  CausalGraphSpec,
  ValidationSummary,
  ReliabilityLevel,
} from '@simulens/shared';
import { api } from '@/lib/api';

/* ─────────────────────────────── types / helpers ─────────────── */

type Tab = 'overview' | 'intervention' | 'counterfactual' | 'causal_graph' | 'validation';
type Theme = 'dark' | 'light';

function fmt(n: number | undefined | null, dec = 2): string {
  if (n == null || isNaN(n as number)) return '—';
  return (n as number).toFixed(dec);
}

function reliabilityColor(level: ReliabilityLevel) {
  if (level === 'high') return 'var(--success)';
  if (level === 'medium') return 'var(--warn)';
  return 'var(--danger)';
}
function reliabilityLabel(level: ReliabilityLevel) {
  return level === 'high' ? 'HIGH' : level === 'medium' ? 'MED' : 'LOW';
}

/* ─────────────────────────────── sub-components ──────────────── */

/* ── Theme Toggle ── */
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: 'var(--muted)',
        fontSize: '11px',
      }}
    >
      {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
      <span className="font-medium" style={{ color: 'var(--text-2)' }}>
        {theme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}

/* ── Status Bar ── */
function StatusBar({ message, loading }: { message: string; loading: boolean }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          background: loading ? 'var(--warn)' : 'var(--success)',
          animation: loading ? 'pulse-dot 1.8s ease-in-out infinite' : 'none',
        }}
      />
      <span className="truncate">{message}</span>
    </div>
  );
}

/* ── Metric Card ── */
function MetricCard({
  label, value, unit, icon: Icon, accentColor, trend,
}: {
  label: string; value: string; unit: string;
  icon: React.ElementType; accentColor?: string;
  trend?: 'up' | 'down' | 'flat';
}) {
  const TIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const tColor = trend === 'up' ? 'var(--danger)' : trend === 'down' ? 'var(--success)' : 'var(--muted)';
  return (
    <div
      className="card card-accent-top card-left-accent rounded-xl p-4 flex flex-col gap-3 relative"
      style={{ borderLeftColor: accentColor ?? 'var(--accent)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </span>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--accent-lo)' }}
        >
          <Icon size={11} style={{ color: 'var(--accent-hi)' }} />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span
            className="mono text-2xl font-semibold metric-val"
            style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}
          >
            {value}
          </span>
          <span className="text-xs ml-1.5" style={{ color: 'var(--muted)' }}>{unit}</span>
        </div>
        {trend && <TIcon size={14} style={{ color: tColor }} />}
      </div>
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, subtitle, children }: {
  title: string; subtitle?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        {subtitle && (
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Slider Row ── */
function SliderRow({
  label, value, min, max, step = 1, unit = '', onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
        <span
          className="mono text-[11px] px-1.5 py-0.5 rounded"
          style={{ color: 'var(--accent-hi)', background: 'var(--accent-lo)', fontWeight: 500 }}
        >
          {value.toFixed(step < 1 ? 1 : 0)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ── Chart Tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-[11px] mono space-y-1"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-2)',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.stroke ?? 'var(--accent-hi)' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

/* ── Pill Badge ── */
function Badge({ label, color = 'var(--accent)', bg = 'var(--accent-lo)' }: {
  label: string; color?: string; bg?: string;
}) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase"
      style={{ color, background: bg, border: `1px solid ${color}33` }}
    >
      {label}
    </span>
  );
}

/* ── Variable Pill Selector ── */
function VarSelector({
  options, value, onChange,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 mb-5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className="flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-150"
          style={{
            background: value === o ? 'var(--accent-mid)' : 'var(--surface-2)',
            color: value === o ? 'var(--accent-hi)' : 'var(--muted)',
            border: `1px solid ${value === o ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          {o.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}

/* ── Primary Button ── */
function PrimaryBtn({ onClick, disabled, loading: isLoading, icon: Icon, label }: {
  onClick: () => void; disabled?: boolean; loading?: boolean;
  icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold transition-all duration-150 disabled:opacity-40"
      style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.35)' }}
    >
      {isLoading ? <RotateCcw size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}

/* ── Divider ── */
function Divider() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />;
}

/* ── Chart common props ── */
const CHART_TICK = { fill: 'var(--muted-2)', fontSize: 10, fontFamily: 'var(--font-mono)' } as const;

/* ─────────────────────────────── main component ─────────────── */

export default function SimuLensDashboard() {
  /* ── Theme ── */
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('sl-theme') as Theme) ?? 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sl-theme', next);
  }, [theme]);

  /* ── Simulator state ── */
  const [currentState, setCurrentState] = useState<SystemState>({
    temperature_c: 65.0, pressure_bar: 3.5, power_kw: 11.2,
    vibration_mm_s: 0.85, cooling_efficiency: 95.0,
  });
  const [currentAction, setCurrentAction] = useState<ControllableAction>({
    machine_load: 50.0, fan_speed: 40.0, coolant_flow: 40.0, cooling_setpoint: 65.0,
  });
  const [currentEnv, setCurrentEnv] = useState<EnvironmentCondition>({ ambient_temperature: 25.0 });
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [predictionEnvelope, setPredictionEnvelope] = useState<PredictionEnvelope | null>(null);
  const [actualTelemetry, setActualTelemetry] = useState<TelemetryStep[]>([]);
  const [validationMetrics, setValidationMetrics] = useState<ValidationSummary | null>(null);
  const [historyEpisodes, setHistoryEpisodes] = useState<TelemetryStep[]>([]);

  /* ── Intervention ── */
  const [interveneVar, setInterveneVar] = useState<'fan_speed' | 'machine_load' | 'coolant_flow'>('fan_speed');
  const [interveneVal, setInterveneVal] = useState<number>(75);
  const [interveneHorizon, setInterveneHorizon] = useState<number>(6);
  const [severedEdges, setSeveredEdges] = useState<Array<{ source: string; target: string }>>([]);

  /* ── Counterfactual ── */
  const [cfChangeStep, setCfChangeStep] = useState<number>(2);
  const [cfVar, setCfVar] = useState<'fan_speed' | 'machine_load' | 'coolant_flow'>('fan_speed');
  const [cfNewVal, setCfNewVal] = useState<number>(80);
  const [cfResult, setCfResult] = useState<any | null>(null);

  /* ── Causal graph ── */
  const [causalGraph, setCausalGraph] = useState<CausalGraphSpec | null>(null);

  /* ── AI ── */
  const [aiPrompt, setAiPrompt] = useState<string>('Increase fan speed to 75% and evaluate cooling effect');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('System nominal. Ready for simulation.');

  /* ── Init ── */
  useEffect(() => {
    async function init() {
      try {
        const initData = await api.getInitialState();
        setCurrentState(initData.state);
        setCurrentAction(initData.action);
        setCurrentEnv(initData.environment);

        const pred = await api.predictNextState(initData.state, initData.action, initData.environment);
        setPredictionEnvelope(pred);

        const dag = await api.getCausalGraph();
        setCausalGraph(dag);

        const actions = [
          { machine_load: 50, fan_speed: 35, coolant_flow: 40 },
          { machine_load: 65, fan_speed: 35, coolant_flow: 40 },
          { machine_load: 75, fan_speed: 35, coolant_flow: 40 },
          { machine_load: 80, fan_speed: 35, coolant_flow: 40 },
          { machine_load: 85, fan_speed: 35, coolant_flow: 40 },
          { machine_load: 85, fan_speed: 35, coolant_flow: 40 },
        ];
        const histRun = await api.runSimulation(initData.state, actions, initData.environment, 101);
        setHistoryEpisodes(histRun.trajectory);
      } catch (err) {
        console.error('Init error:', err);
      }
    }
    init();
  }, []);

  /* ── Handlers ── */
  const handleStep = async () => {
    setLoading(true);
    try {
      const res = await api.stepSimulation(currentState, currentAction, currentEnv);
      setCurrentState(res.observed.state);
      setCurrentEnv(res.observed.environment);
      const p = await api.predictNextState(res.observed.state, currentAction, res.observed.environment);
      setPredictionEnvelope(p);
      setStatusMessage(`Step t=${res.t} done. Temp: ${res.observed.state.temperature_c.toFixed(2)}°C`);
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    } finally { setLoading(false); }
  };

  const handleIntervention = async () => {
    setLoading(true);
    setStatusMessage(`do(${interveneVar} = ${interveneVal})…`);
    try {
      const spec: InterventionSpec = { target_variable: interveneVar, forced_value: interveneVal, start_step: 0, horizon: interveneHorizon };
      const res = await api.simulateIntervention(currentState, currentAction, spec, currentEnv);
      setPredictionEnvelope(res.prediction);
      setSeveredEdges(res.graphSurgery.severedEdges);
      const acts = Array(interveneHorizon).fill({ ...currentAction, [interveneVar]: interveneVal });
      const actual = await api.runSimulation(currentState, acts, currentEnv);
      setActualTelemetry(actual.trajectory);
      const val = await api.evaluateValidation(res.prediction, actual.trajectory);
      setValidationMetrics(val);
      setStatusMessage(`Intervention done. ${res.graphSurgery.severedEdges.length} edge(s) severed. MAE: ${val.mae.temperature_c.toFixed(3)}°C`);
    } catch (e: any) {
      setStatusMessage(`Intervention error: ${e.message}`);
    } finally { setLoading(false); }
  };

  const handleCounterfactual = async () => {
    if (historyEpisodes.length < 2) return;
    setLoading(true);
    setStatusMessage('Abducting residuals and replaying counterfactual…');
    try {
      const recorded_steps = [
        { t: 0, machine_load: currentAction.machine_load, fan_speed: currentAction.fan_speed, coolant_flow: currentAction.coolant_flow, ambient_temperature: currentEnv.ambient_temperature, ...currentState },
        ...historyEpisodes.map((s) => ({ t: s.t, machine_load: s.action.machine_load, fan_speed: s.action.fan_speed, coolant_flow: s.action.coolant_flow, ambient_temperature: s.environment.ambient_temperature, ...s.state })),
      ];
      const spec: CounterfactualSpec = { change_step: cfChangeStep, changed_variable: cfVar, new_value: cfNewVal, recorded_steps };
      const res = await api.runCounterfactual(spec);
      setCfResult(res);
      setStatusMessage(`CF done. ΔTemp: ${res.divergenceSummary.temperatureDiff.toFixed(2)}°C`);
    } catch (e: any) {
      setStatusMessage(`CF error: ${e.message}`);
    } finally { setLoading(false); }
  };

  const handleAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.interpretWithAI(aiPrompt);
      setAiResponse(`${res.summary}\n\n[Rationale]: ${res.reasoning_rationale}`);
      if (res.recognized_action) {
        setInterveneVar(res.recognized_action.variable as any);
        setInterveneVal(res.recognized_action.value);
        setInterveneHorizon(res.recognized_action.horizon || 6);
        setActiveTab('intervention');
      }
    } catch (e: any) {
      setAiResponse(`AI Error: ${e.message}`);
    } finally { setAiLoading(false); }
  };

  /* ── Chart data ── */
  const chartData = React.useMemo(() => {
    if (!predictionEnvelope) return [];
    return predictionEnvelope.steps.map((p, i) => {
      const a = actualTelemetry[i]?.state;
      const t = p.variables.temperature_c;
      return { step: `t+${p.step}`, predicted: t.mean, lo90: t.lo_90, hi90: t.hi_90, actual: a?.temperature_c ?? null };
    });
  }, [predictionEnvelope, actualTelemetry]);

  const cfChartData = React.useMemo(() => {
    if (!cfResult) return [];
    return cfResult.actualTrajectory.map((a: any, i: number) => {
      const cf = cfResult.counterfactualTrajectory[i];
      return { step: `t=${a.t}`, factual: a.state.temperature_c, counterfactual: cf.state.temperature_c };
    });
  }, [cfResult]);

  const reliability: ReliabilityLevel = predictionEnvelope?.steps[0]?.reliability_level ?? 'high';

  /* ── Nav config ── */
  const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',       label: 'Overview',       icon: LayoutDashboard },
    { id: 'intervention',   label: 'Intervention',   icon: Sliders },
    { id: 'counterfactual', label: 'Counterfactual', icon: History },
    { id: 'causal_graph',   label: 'Causal Graph',   icon: GitBranch },
    { id: 'validation',     label: 'Validation',     icon: ShieldCheck },
  ];

  /* ── Render ── */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── SIDEBAR ── */}
      <aside
        className="sidebar-bg flex-shrink-0 flex flex-col py-5 px-3 gap-1"
        style={{ width: 208, borderRight: '1px solid var(--border)' }}
      >
        {/* Branding */}
        <div className="px-2 mb-6">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: 'var(--accent-lo)',
                border: '1px solid var(--accent-mid)',
                boxShadow: 'var(--glow)',
              }}
            >
              <Cpu size={15} style={{ color: 'var(--accent-hi)' }} />
            </div>
            <div>
              <p className="text-[13px] font-bold leading-none" style={{ color: 'var(--text)' }}>
                Simu<span style={{ color: 'var(--accent-hi)' }}>Lens</span>
              </p>
              <p className="text-[9px] mt-0.5 font-medium tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                World Model
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg w-full text-left transition-all duration-150 ${active ? 'nav-active' : ''}`}
                style={{
                  fontSize: '12px',
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--accent-hi)' : 'var(--muted)',
                  background: active ? 'var(--accent-lo)' : 'transparent',
                  border: active ? '1px solid var(--accent-mid)' : '1px solid transparent',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Status */}
        <div
          className="mx-1 mb-1 p-3 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <StatusBar message={statusMessage} loading={loading} />
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Accent line */}
        <div className="accent-rule" />

        {/* Top bar */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-6"
          style={{
            height: 47,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <div className="flex items-center gap-2" style={{ fontSize: '11px', color: 'var(--muted)' }}>
            <span>SimuLens</span>
            <ChevronRight size={11} />
            <span className="font-medium capitalize" style={{ color: 'var(--text-2)' }}>
              {activeTab.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Reliability badge */}
            <div className="flex items-center gap-1.5" style={{ fontSize: '11px', color: 'var(--muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: reliabilityColor(reliability) }} />
              <span className="mono font-medium" style={{ color: reliabilityColor(reliability) }}>
                {reliabilityLabel(reliability)}
              </span>
            </div>

            {/* Step button */}
            <button
              onClick={handleStep}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 disabled:opacity-40"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
              }}
            >
              <Play size={11} />
              Step
            </button>

            {/* Theme toggle */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        {/* Content */}
        <div
          className="fade-up"
          key={activeTab}
          style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-subtle)' }}
        >

          {/* ══════ OVERVIEW ══════ */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>

              {/* Metric cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MetricCard label="Temperature" value={fmt(currentState.temperature_c)} unit="°C"
                  icon={Thermometer} accentColor="var(--danger)"
                  trend={currentState.temperature_c > 70 ? 'up' : 'flat'} />
                <MetricCard label="Pressure" value={fmt(currentState.pressure_bar)} unit="bar"
                  icon={Gauge} accentColor="var(--warn)" />
                <MetricCard label="Power" value={fmt(currentState.power_kw)} unit="kW"
                  icon={Zap} accentColor="var(--success)" />
                <MetricCard label="Vibration" value={fmt(currentState.vibration_mm_s, 3)} unit="mm/s"
                  icon={Activity} accentColor="var(--accent-hi)" />
              </div>

              {/* Chart */}
              <div className="card card-accent-top rounded-xl p-5">
                <SectionHeader
                  title="Predicted Temperature Trajectory"
                  subtitle="Next-state prediction · 90% confidence band · graph surgery applied"
                >
                  {predictionEnvelope && (
                    <Badge
                      label={`σ² ${fmt(predictionEnvelope.steps[0]?.variables.temperature_c?.epistemic_var ?? 0, 4)}`}
                      color="var(--accent-hi)"
                      bg="var(--accent-lo)"
                    />
                  )}
                </SectionHeader>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="step" tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="hi90" stroke="none" fill="rgba(37,99,235,0.1)" name="90% upper" />
                      <Area type="monotone" dataKey="lo90" stroke="none" fill="transparent" name="90% lower" />
                      <Line type="monotone" dataKey="predicted" stroke="var(--accent)" strokeWidth={2} dot={false} name="Predicted" />
                      <Line type="monotone" dataKey="actual" stroke="var(--success)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Actual" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
                    Initialising world model…
                  </div>
                )}
              </div>

              {/* Controls + Envelope */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card card-accent-top rounded-xl p-5">
                  <SectionHeader title="System Controls" subtitle="Adjust controllable actions" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <SliderRow label="Fan Speed" value={currentAction.fan_speed} min={0} max={100} unit="%" onChange={(v) => setCurrentAction((a) => ({ ...a, fan_speed: v }))} />
                    <SliderRow label="Machine Load" value={currentAction.machine_load} min={0} max={100} unit="%" onChange={(v) => setCurrentAction((a) => ({ ...a, machine_load: v }))} />
                    <SliderRow label="Coolant Flow" value={currentAction.coolant_flow} min={0} max={100} unit="%" onChange={(v) => setCurrentAction((a) => ({ ...a, coolant_flow: v }))} />
                    <SliderRow label="Ambient Temperature" value={currentEnv.ambient_temperature} min={15} max={45} unit="°C" onChange={(v) => setCurrentEnv((e) => ({ ...e, ambient_temperature: v }))} />
                  </div>
                </div>

                {predictionEnvelope ? (
                  <div className="card card-accent-top rounded-xl p-5">
                    <SectionHeader title="Next-State Envelope" subtitle={`Horizon: ${predictionEnvelope.steps.length} steps`} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {(['temperature_c', 'pressure_bar', 'power_kw', 'vibration_mm_s'] as const).map((key) => {
                        const v = predictionEnvelope.steps[0]?.variables[key];
                        if (!v) return null;
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                            <span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{key}</span>
                            <div className="flex items-center gap-3 mono text-[11px]">
                              <span style={{ color: 'var(--muted-2)' }}>[{fmt(v.lo_90)} – {fmt(v.hi_90)}]</span>
                              <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(v.mean)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 10, color: 'var(--muted)' }}>
                      Reliability: <span style={{ color: reliabilityColor(reliability), fontWeight: 600 }}>{reliabilityLabel(reliability)}</span>
                      {' '}· {predictionEnvelope.steps[0]?.reliability_reason}
                    </div>
                  </div>
                ) : (
                  <div className="card rounded-xl p-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
                    Run a step to see the prediction envelope
                  </div>
                )}
              </div>

              {/* AI NL */}
              <div className="card card-accent-top rounded-xl p-5">
                <SectionHeader title="Natural Language Interface" subtitle="Describe an intervention — powered by OpenRouter AI (LLM is interface only, never produces predictions)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    style={{ flex: 1 }}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Increase fan speed to 80% for 8 steps…"
                    onKeyDown={(e) => e.key === 'Enter' && handleAI()}
                  />
                  <button
                    onClick={handleAI}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-all"
                    style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
                  >
                    {aiLoading ? <RotateCcw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    Run
                  </button>
                </div>
                {aiResponse && (
                  <pre
                    style={{
                      marginTop: 12, padding: '12px', borderRadius: 8,
                      fontSize: 11, fontFamily: 'var(--font-mono)',
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                    }}
                  >
                    {aiResponse}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* ══════ INTERVENTION ══════ */}
          {activeTab === 'intervention' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
                <div className="card card-accent-top rounded-xl p-5">
                  <SectionHeader title="Intervention do(X = x)" subtitle="Severs parent edges of target variable via graph surgery" />
                  <VarSelector
                    options={['fan_speed', 'machine_load', 'coolant_flow']}
                    value={interveneVar}
                    onChange={(v) => setInterveneVar(v as any)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <SliderRow label="Forced Value" value={interveneVal} min={0} max={100} unit="%" onChange={setInterveneVal} />
                    <SliderRow label="Horizon (steps)" value={interveneHorizon} min={1} max={20} onChange={setInterveneHorizon} />
                  </div>
                  <PrimaryBtn onClick={handleIntervention} disabled={loading} loading={loading} icon={Play} label="Run Intervention" />
                  {severedEdges.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Severed edges</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {severedEdges.map((e, i) => (
                          <div key={i} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                            {e.source} <span style={{ color: 'var(--muted)' }}>→</span> {e.target}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="card card-accent-top rounded-xl p-5">
                  <SectionHeader title="Predicted vs Ground Truth" subtitle="Post-intervention temperature trajectory" />
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="step" tick={CHART_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="hi90" stroke="none" fill="rgba(37,99,235,0.1)" name="90% upper" />
                        <Area type="monotone" dataKey="lo90" stroke="none" fill="transparent" name="90% lower" />
                        <Line type="monotone" dataKey="predicted" stroke="var(--accent)" strokeWidth={2} dot={false} name="Predicted" />
                        <Line type="monotone" dataKey="actual" stroke="var(--success)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Actual" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
                      Run an intervention to see results
                    </div>
                  )}
                  {validationMetrics && (
                    <div style={{ marginTop: 16, padding: '12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {(['temperature_c', 'pressure_bar', 'power_kw'] as const).map((k) => (
                        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                            {fmt((validationMetrics.mae as any)[k])}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>MAE</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════ COUNTERFACTUAL ══════ */}
          {activeTab === 'counterfactual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
                <div className="card card-accent-top rounded-xl p-5">
                  <SectionHeader title="Counterfactual Reasoning" subtitle="Abduction → Action → Prediction on a recorded episode" />
                  <VarSelector
                    options={['fan_speed', 'machine_load', 'coolant_flow']}
                    value={cfVar}
                    onChange={(v) => setCfVar(v as any)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <SliderRow label="Change at Step" value={cfChangeStep} min={1} max={Math.max(1, historyEpisodes.length - 1)} onChange={setCfChangeStep} />
                    <SliderRow label="Counterfactual Value" value={cfNewVal} min={0} max={100} unit="%" onChange={setCfNewVal} />
                  </div>
                  <PrimaryBtn onClick={handleCounterfactual} disabled={loading || historyEpisodes.length < 2} loading={loading} icon={History} label="Replay Counterfactual" />

                  {cfResult && (
                    <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Divergence</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[['Temperature', cfResult.divergenceSummary.temperatureDiff, '°C'], ['Power', cfResult.divergenceSummary.powerDiff, ' kW']].map(([name, val, u]) => (
                          <div key={String(name)}>
                            <p style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{name} Δ</p>
                            <p className="mono" style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                              {fmt(val as number)}{u}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="card card-accent-top rounded-xl p-5">
                  <SectionHeader title="Factual vs Counterfactual" subtitle="Temperature divergence from abducted noise replay" />
                  {cfChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={cfChartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="step" tick={CHART_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="factual" stroke="var(--muted)" strokeWidth={1.5} dot={false} name="Factual" />
                        <Line type="monotone" dataKey="counterfactual" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Counterfactual" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
                      Run a counterfactual to see divergence
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════ CAUSAL GRAPH ══════ */}
          {activeTab === 'causal_graph' && (
            <div style={{ maxWidth: 800 }}>
              <div className="card card-accent-top rounded-xl p-5">
                <SectionHeader title="Structural Causal Model (SCM)" subtitle="Directed acyclic graph — arrows show causation, not correlation" />
                {causalGraph ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Variables</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {causalGraph.nodes.map((node) => (
                          <div key={node.id} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', color: node.observable ? 'var(--accent-hi)' : 'var(--muted)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ width: 6, height: 6, borderRadius: '50%', background: node.observable ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }} />
                            {node.id}
                            {!node.observable && <span style={{ fontSize: 9, color: 'var(--muted-2)' }}>(latent)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Divider />
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Causal Edges ({causalGraph.edges.length})
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {causalGraph.edges.map((edge, i) => (
                          <div key={i} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span style={{ color: 'var(--text-2)' }}>{edge.source}</span>
                            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>→</span>
                            <span style={{ color: 'var(--text-2)' }}>{edge.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {causalGraph.mechanisms && Object.keys(causalGraph.mechanisms).length > 0 && (
                      <>
                        <Divider />
                        <div>
                          <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Structural Mechanisms</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(causalGraph.mechanisms).map(([key, eq]) => (
                              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                <span className="mono" style={{ fontSize: 10, color: 'var(--accent-hi)', minWidth: 110 }}>{key}</span>
                                <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>:= {String(eq)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
                    Loading causal graph…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════ VALIDATION ══════ */}
          {activeTab === 'validation' && (
            <div style={{ maxWidth: 800 }}>
              <div className="card card-accent-top rounded-xl p-5">
                <SectionHeader title="Ground-Truth Validation" subtitle="Run an intervention first — then compare predicted vs simulated actual" />
                {validationMetrics ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Variable', 'MAE', 'RMSE', 'Coverage 90%'].map((h) => (
                            <th key={h} style={{ textAlign: h === 'Variable' ? 'left' : 'right', padding: '8px 0', color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(validationMetrics.mae).map((key) => {
                          const coverage = (validationMetrics as any).coverage_90?.[key];
                          const ok = coverage != null && coverage >= 0.8;
                          return (
                            <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="mono" style={{ padding: '10px 0', color: 'var(--text-2)' }}>{key}</td>
                              <td className="mono" style={{ textAlign: 'right', padding: '10px 0', color: 'var(--text)' }}>{fmt((validationMetrics.mae as any)[key])}</td>
                              <td className="mono" style={{ textAlign: 'right', padding: '10px 0', color: 'var(--text)' }}>{fmt((validationMetrics as any).rmse?.[key])}</td>
                              <td style={{ textAlign: 'right', padding: '10px 0' }}>
                                {coverage != null ? (
                                  <span className="mono" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: ok ? 'var(--success)' : 'var(--danger)', border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                                    {(coverage * 100).toFixed(0)}%
                                  </span>
                                ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={14} style={{ color: reliabilityColor(reliability), flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>Reliability: {reliabilityLabel(reliability)}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{predictionEnvelope?.steps[0]?.reliability_reason ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 16, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                      No validation data yet. Run an intervention on the Intervention tab to generate ground-truth comparisons.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
