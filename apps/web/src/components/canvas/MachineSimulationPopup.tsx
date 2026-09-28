'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  Loader2,
  Sliders,
  Activity,
  AlertTriangle,
  Thermometer,
  Gauge,
  Zap,
  Radio,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Power,
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
import { api } from '@/lib/api';
import { CachedMachine } from '@/lib/branchStore';
import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  PredictionEnvelope,
  IntervenableVariable,
} from '@simulens/shared';

interface MachineSimulationPopupProps {
  machine: CachedMachine;
  orgSlug: string;
  branchId: string;
  onClose: () => void;
  onTelemetryUpdate: (machineId: string, telemetry: Record<string, any>, status?: CachedMachine['status']) => void;
}

export function MachineSimulationPopup({
  machine,
  orgSlug,
  branchId,
  onClose,
  onTelemetryUpdate,
}: MachineSimulationPopupProps) {
  const [simulating, setSimulating] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [activeTab, setActiveTab] = useState<'control' | 'intervene'>('control');

  // Active resources (multi-select)
  const [activeResources, setActiveResources] = useState<string[]>(() => {
    if (Array.isArray(machine.config_json?.active_resources) && machine.config_json.active_resources.length > 0) {
      return machine.config_json.active_resources;
    }
    return [
      ...(machine.machine_type !== 'generator' ? ['electricity'] : []),
      ...(machine.config_json?.primary_resource
        ? [machine.config_json.primary_resource]
        : machine.machine_type === 'boiler' ? ['diesel']
        : machine.machine_type === 'generator' ? ['diesel']
        : machine.machine_type === 'compressor' ? ['petrol']
        : machine.machine_type === 'chiller' ? ['hydrogen']
        : [])
    ];
  });
  const [selectedResource, setSelectedResource] = useState<string>(
    machine.config_json?.primary_resource || 'electricity'
  );
  const [resourceRate, setResourceRate] = useState<number>(
    machine.config_json?.resource_rate || 14.5
  );

  const handleToggleResource = (resKey: string) => {
    setActiveResources((prev) => {
      const next = prev.includes(resKey) ? prev.filter((r) => r !== resKey) : [...prev, resKey];
      onTelemetryUpdate(
        machine.id,
        {
          primary_resource: next[0] || 'electricity',
          active_resources: next,
          resource_rate: resourceRate,
        },
        machine.status
      );
      return next;
    });
  };

  // Simulation physics state
  const [currentState, setCurrentState] = useState<SystemState>({
    temperature_c: machine.config_json?.current_telemetry?.temperature_c ?? 65.0,
    pressure_bar: machine.config_json?.current_telemetry?.pressure_bar ?? 2.8,
    power_kw: machine.config_json?.current_telemetry?.power_kw ?? 18.5,
    vibration_mm_s: machine.config_json?.current_telemetry?.vibration_mm_s ?? 0.35,
    cooling_efficiency: machine.config_json?.current_telemetry?.efficiency ?? 0.95,
  });

  const [action, setAction] = useState<ControllableAction>({
    fan_speed: 60,
    machine_load: 75,
    coolant_flow: 50,
  });

  const [environment, setEnvironment] = useState<EnvironmentCondition>({
    ambient_temperature: 25,
  });

  const [horizon, setHorizon] = useState(10);
  const [prediction, setPrediction] = useState<PredictionEnvelope | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  // Intervention state
  const [interventionVar, setInterventionVar] = useState<IntervenableVariable>('fan_speed');
  const [interventionVal, setInterventionVal] = useState(85);

  // Run initial prediction on popup open
  useEffect(() => {
    runQuickForecast(action, environment);
  }, []);

  const runQuickForecast = async (act: ControllableAction, env: EnvironmentCondition) => {
    setSimulating(true);
    try {
      const actions = Array(horizon).fill(act);
      const res = await api.predictActionConditioned(currentState, actions, env);
      setPrediction(res);

      const data = res.steps.map((s, i) => ({
        step: i + 1,
        temp_mean: s.variables.temperature_c?.mean,
        temp_lo: s.variables.temperature_c?.lo_90,
        temp_hi: s.variables.temperature_c?.hi_90,
        power_mean: s.variables.power_kw?.mean,
      }));
      setChartData(data);
    } catch (e) {
      console.error('Quick forecast error:', e);
    } finally {
      setSimulating(false);
    }
  };

  const handleTogglePower = () => {
    const isNowOffline = machine.status !== 'offline';
    onTelemetryUpdate(
      machine.id,
      {
        temperature_c: isNowOffline ? 25 : currentState.temperature_c,
        power_kw: isNowOffline ? 0 : currentState.power_kw,
        resource_rate: isNowOffline ? 0 : resourceRate,
      },
      isNowOffline ? 'offline' : 'running'
    );
  };

  const handleApplyAction = async () => {
    setSimulating(true);
    setCountdown(10);
    try {
      const actions = Array(horizon).fill(action);
      const res = await api.predictActionConditioned(currentState, actions, environment);
      setPrediction(res);
      const steps = res.steps || [];

      // Step-by-step 10-second rollout: broadcast 1 step per second for 10 seconds
      for (let sec = 1; sec <= 10; sec++) {
        const stepIndex = Math.min(sec - 1, steps.length - 1);
        const curStep = steps[stepIndex];
        const nextTemp = curStep?.variables.temperature_c?.mean ?? currentState.temperature_c;
        const nextPower = curStep?.variables.power_kw?.mean ?? currentState.power_kw;
        const nextPressure = curStep?.variables.pressure_bar?.mean ?? currentState.pressure_bar;
        const nextVib = curStep?.variables.vibration_mm_s?.mean ?? currentState.vibration_mm_s;
        const rem = 10 - sec;
        setCountdown(rem);

        const updatedState = {
          temperature_c: Math.round(nextTemp * 10) / 10,
          pressure_bar: Math.round(nextPressure * 100) / 100,
          power_kw: Math.round(nextPower * 10) / 10,
          vibration_mm_s: Math.round(nextVib * 100) / 100,
          cooling_efficiency: currentState.cooling_efficiency,
        };
        setCurrentState(updatedState);

        const isWarning = nextTemp > 85;
        const status = isWarning ? 'warning' : 'running';

        onTelemetryUpdate(
          machine.id,
          {
            ...updatedState,
            primary_resource: activeResources[0] || 'electricity',
            active_resources: activeResources,
            resource_rate: resourceRate,
          },
          status
        );

        if (rem > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (e) {
      console.error('Apply action error:', e);
    } finally {
      setSimulating(false);
      setCountdown(0);
    }
  };

  const handleApplyIntervention = async () => {
    setSimulating(true);
    try {
      const res = await api.simulateIntervention(
        currentState,
        action,
        {
          target_variable: interventionVar,
          forced_value: interventionVal,
          start_step: 0,
          horizon,
        },
        environment
      );
      setPrediction(res.prediction);

      if (res.prediction.steps.length > 0) {
        const lastStep = res.prediction.steps[res.prediction.steps.length - 1];
        const nextTemp = lastStep.variables.temperature_c?.mean ?? currentState.temperature_c;
        const nextPower = lastStep.variables.power_kw?.mean ?? currentState.power_kw;
        const nextPressure = lastStep.variables.pressure_bar?.mean ?? currentState.pressure_bar;
        const nextVib = lastStep.variables.vibration_mm_s?.mean ?? currentState.vibration_mm_s;

        const updatedState = {
          temperature_c: nextTemp,
          pressure_bar: nextPressure,
          power_kw: nextPower,
          vibration_mm_s: nextVib,
          cooling_efficiency: currentState.cooling_efficiency,
        };
        setCurrentState(updatedState);

        const isWarning = nextTemp > 85;
        onTelemetryUpdate(
          machine.id,
          {
            ...updatedState,
            primary_resource: selectedResource,
            resource_rate: resourceRate,
          },
          isWarning ? 'warning' : 'running'
        );
      }
    } catch (e) {
      console.error('Intervention error:', e);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-lg shadow-2xl border-l flex flex-col backdrop-blur-md animate-fade-in"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {machine.label} — Live Control
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              In-Place Causal Simulation & Resource Modulation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Master Power Switch */}
          <button
            onClick={handleTogglePower}
            className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1 transition-all ${
              machine.status === 'offline'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 hover:text-emerald-500'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-500'
            }`}
            title={machine.status === 'offline' ? 'Machine is OFF. Click to Power ON' : 'Machine is ON. Click to Turn OFF'}
          >
            <Power className="w-3.5 h-3.5" />
            <span className="font-semibold">{machine.status === 'offline' ? 'Power OFF' : 'Power ON'}</span>
          </button>

          <Link
            href={`/dashboard/${orgSlug}/${branchId}/simulation`}
            target="_blank"
            className="p-1.5 rounded-lg border text-xs flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="Open Central Multi-Machine Console on PC2"
          >
            <span>PC2</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-xs font-medium" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('control')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
            activeTab === 'control'
              ? 'border-indigo-500 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Action & Resource Sliders
        </button>
        <button
          onClick={() => setActiveTab('intervene')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
            activeTab === 'intervene'
              ? 'border-indigo-500 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pearl do(X=x) Graph Surgery
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Live Gauges Row */}
        <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
          <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Temp</span>
            <p className="font-semibold text-xs mt-0.5" style={{ color: currentState.temperature_c > 85 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {currentState.temperature_c.toFixed(1)}°C
            </p>
          </div>
          <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Power</span>
            <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {currentState.power_kw.toFixed(1)} kW
            </p>
          </div>
          <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Pressure</span>
            <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {currentState.pressure_bar.toFixed(2)} bar
            </p>
          </div>
          <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Vibration</span>
            <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {currentState.vibration_mm_s.toFixed(2)} mm/s
            </p>
          </div>
        </div>

        {activeTab === 'control' ? (
          /* Action Sliders & Resources */
          <div className="space-y-3.5">
            {/* Machine Load Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Machine Operational Load</span>
                <span className="font-mono font-semibold">{action.machine_load}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={action.machine_load}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAction((prev) => ({ ...prev, machine_load: val }));
                }}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Fan Speed Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Fan / Cooling Speed</span>
                <span className="font-mono font-semibold">{action.fan_speed}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={action.fan_speed}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAction((prev) => ({ ...prev, fan_speed: val }));
                }}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Coolant Flow Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Coolant Circulation Flow</span>
                <span className="font-mono font-semibold">{action.coolant_flow}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={action.coolant_flow}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAction((prev) => ({ ...prev, coolant_flow: val }));
                }}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Resource & Energy Feed Selection (Multi-Select) */}
            <div className="p-3 rounded-xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  Resource & Power Inflow (Multi-Select)
                </span>
                <span className="text-[10px] text-indigo-500 font-mono">
                  {activeResources.length} active feeds
                </span>
              </div>

              {/* Resource Multi-Select Buttons */}
              <div className="grid grid-cols-5 gap-1.5 text-[9px] font-semibold">
                {[
                  { key: 'electricity', label: '⚡ Grid', color: '#38bdf8' },
                  { key: 'diesel', label: '⛽ Diesel', color: '#f97316' },
                  { key: 'petrol', label: '⛽ Petrol', color: '#eab308' },
                  { key: 'hydrogen', label: '🧪 H2 Gas', color: '#10b981' },
                  { key: 'kerosene', label: '🛢️ Kero', color: '#a855f7' },
                ].map((res) => {
                  const isSelected = activeResources.includes(res.key);
                  return (
                    <button
                      key={res.key}
                      type="button"
                      onClick={() => handleToggleResource(res.key)}
                      className={`py-1.5 px-1 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                        isSelected ? 'font-bold shadow-sm ring-1' : 'opacity-40 hover:opacity-80'
                      }`}
                      style={{
                        borderColor: isSelected ? res.color : 'var(--border)',
                        backgroundColor: isSelected ? `${res.color}18` : 'transparent',
                        color: isSelected ? res.color : 'var(--text-tertiary)',
                      }}
                      title={`Click to toggle ${res.label} ${isSelected ? 'OFF' : 'ON'}`}
                    >
                      <span>{res.label}</span>
                      <span className={`text-[8px] font-mono px-1 rounded ${isSelected ? 'bg-emerald-500/20 text-emerald-500' : 'text-slate-400'}`}>
                        {isSelected ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Resource Flow Slider */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span style={{ color: 'var(--text-secondary)' }}>Supply Inflow Rate</span>
                  <span className="font-mono">{resourceRate} L/h</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={resourceRate}
                  onChange={(e) => setResourceRate(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Intervention Graph Surgery Tab */
          <div className="space-y-3.5">
            <div className="p-3 rounded-xl border bg-indigo-500/5" style={{ borderColor: 'rgba(99, 102, 241, 0.2)' }}>
              <p className="text-xs font-semibold text-indigo-600 mb-1">
                Pearl's Graph Surgery do(X = x)
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Sever all causal parent edges to the forced variable and simulate unconfounded counter-policy effects.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Target Variable do(X)
              </label>
              <select
                value={interventionVar}
                onChange={(e) => setInterventionVar(e.target.value as IntervenableVariable)}
                className="w-full px-3 py-2 rounded-lg border text-xs"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="fan_speed">do(fan_speed = x) — Forced Fan Velocity</option>
                <option value="machine_load">do(machine_load = x) — Forced Plant Load</option>
                <option value="coolant_flow">do(coolant_flow = x) — Forced Coolant Rate</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Forced Value</span>
                <span className="font-mono font-semibold">{interventionVal}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={interventionVal}
                onChange={(e) => setInterventionVal(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Prediction Chart Preview with Uncertainty Envelope */}
        {chartData.length > 0 && (
          <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Uncertainty Forecast (90% Envelope)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600">
                Calibrated Model
              </span>
            </div>

            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="step" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip contentStyle={{ fontSize: 11, backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }} />
                  <Area type="monotone" dataKey="temp_hi" stroke="none" fill="#3b82f6" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="temp_lo" stroke="none" fill="#ffffff" fillOpacity={0} />
                  <Line type="monotone" dataKey="temp_mean" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="p-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onClose}
          className="flex-1 py-2 px-3 rounded-xl border text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          onClick={activeTab === 'control' ? handleApplyAction : handleApplyIntervention}
          disabled={simulating}
          className="flex-2 py-2 px-4 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm flex items-center justify-center gap-1.5"
          style={{ backgroundColor: simulating ? '#6366f1' : 'var(--accent)' }}
        >
          {simulating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{countdown > 0 ? `Rolling Out Trajectory (${countdown}s)...` : 'Simulating...'}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{activeTab === 'control' ? 'Apply & Sync to Floor Plan (10s)' : 'Execute do() Graph Surgery'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
