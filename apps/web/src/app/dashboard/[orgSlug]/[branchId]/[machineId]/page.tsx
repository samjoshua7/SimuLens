'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import {
  Play,
  Loader2,
  ArrowLeft,
  Sliders,
  Activity,
  AlertTriangle,
  Thermometer,
  Gauge,
  Zap,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
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
  PredictionEnvelope,
  IntervenableVariable,
} from '@simulens/shared';

interface Machine {
  id: string;
  branch_id: string;
  label: string;
  machine_type: string;
  status: string;
  config_json?: Record<string, any>;
}

export default function MachineSimulationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const branchId = params.branchId as string;
  const machineId = params.machineId as string;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Simulation state
  const [currentState, setCurrentState] = useState<SystemState>({
    temperature_c: 65.0,
    pressure_bar: 3.5,
    power_kw: 11.2,
    vibration_mm_s: 0.85,
    cooling_efficiency: 95.0,
  });

  const [action, setAction] = useState<ControllableAction>({
    machine_load: 50,
    fan_speed: 40,
    coolant_flow: 40,
  });

  const [environment, setEnvironment] = useState<EnvironmentCondition>({
    ambient_temperature: 25.0,
  });

  const [horizon, setHorizon] = useState(10);
  const [prediction, setPrediction] = useState<PredictionEnvelope | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<Array<Record<string, unknown>>>([]);
  const [activeTab, setActiveTab] = useState<'predict' | 'intervene'>('predict');

  // Intervention state
  const [interventionVar, setInterventionVar] = useState<IntervenableVariable>('fan_speed');
  const [interventionVal, setInterventionVal] = useState(80);

  useEffect(() => {
    async function fetchMachine() {
      if (!user) return;
      const { data } = await supabase
        .from('branch_machines')
        .select('*')
        .eq('id', machineId)
        .single();

      if (!data) {
        router.replace(`/dashboard/${orgSlug}/${branchId}`);
        return;
      }
      setMachine(data);

      // Initialize from API or stored telemetry
      try {
        const init = await api.getInitialState();
        const storedTelemetry = data.config_json?.current_telemetry;
        if (storedTelemetry) {
          setCurrentState((prev) => ({
            ...prev,
            temperature_c: storedTelemetry.temperature_c ?? prev.temperature_c,
            pressure_bar: storedTelemetry.pressure_bar ?? prev.pressure_bar,
            power_kw: storedTelemetry.power_kw ?? prev.power_kw,
            vibration_mm_s: storedTelemetry.vibration_mm_s ?? prev.vibration_mm_s,
          }));
        } else {
          setCurrentState(init.state);
        }
        setAction(init.action);
        setEnvironment(init.environment);
      } catch {
        // Use defaults
      }
      setLoading(false);
    }
    fetchMachine();
  }, [user, machineId, orgSlug, branchId, router]);

  // Broadcast telemetry to PC1 Floor Plan via Supabase Realtime channel
  const broadcastSync = async (stateToSync: Partial<SystemState>) => {
    const updatedState = { ...currentState, ...stateToSync };
    const isWarning = updatedState.temperature_c > 85 || updatedState.pressure_bar > 6.0;
    const newStatus = isWarning ? 'warning' : 'running';

    try {
      const channel = supabase.channel(`branch_sync_${branchId}`);
      channel.send({
        type: 'broadcast',
        event: 'telemetry_sync',
        payload: {
          machine_id: machineId,
          status: newStatus,
          telemetry: {
            temperature_c: updatedState.temperature_c,
            pressure_bar: updatedState.pressure_bar,
            power_kw: updatedState.power_kw,
            vibration_mm_s: updatedState.vibration_mm_s,
            efficiency: updatedState.cooling_efficiency,
          },
        },
      });

      await supabase
        .from('branch_machines')
        .update({
          status: newStatus,
          config_json: {
            ...(machine?.config_json || {}),
            current_telemetry: {
              temperature_c: updatedState.temperature_c,
              pressure_bar: updatedState.pressure_bar,
              power_kw: updatedState.power_kw,
              vibration_mm_s: updatedState.vibration_mm_s,
              efficiency: updatedState.cooling_efficiency,
              timestamp: new Date().toISOString(),
            },
          },
        })
        .eq('id', machineId);
    } catch (e) {
      console.error('Failed to broadcast sync telemetry:', e);
    }
  };

  const handlePredict = async () => {
    setSimulating(true);
    try {
      const actions = Array(horizon).fill(action);
      const result = await api.predictActionConditioned(currentState, actions, environment);
      setPrediction(result);

      // Build chart data
      const chartData = result.steps.map((step, i) => ({
        step: i + 1,
        temp_mean: step.variables.temperature_c?.mean,
        temp_lo: step.variables.temperature_c?.lo_90,
        temp_hi: step.variables.temperature_c?.hi_90,
        pressure_mean: step.variables.pressure_bar?.mean,
        power_mean: step.variables.power_kw?.mean,
        vibration_mean: step.variables.vibration_mm_s?.mean,
      }));
      setTrajectoryData(chartData);

      // Update state to final horizon step & broadcast to PC1 floor plan
      if (result.steps.length > 0) {
        const lastStep = result.steps[result.steps.length - 1];
        const nextState = {
          temperature_c: lastStep.variables.temperature_c?.mean ?? currentState.temperature_c,
          pressure_bar: lastStep.variables.pressure_bar?.mean ?? currentState.pressure_bar,
          power_kw: lastStep.variables.power_kw?.mean ?? currentState.power_kw,
          vibration_mm_s: lastStep.variables.vibration_mm_s?.mean ?? currentState.vibration_mm_s,
        };
        setCurrentState((prev) => ({ ...prev, ...nextState }));
        await broadcastSync(nextState);
      }
    } catch (err) {
      console.error('Prediction failed:', err);
    }
    setSimulating(false);
  };

  const handleIntervene = async () => {
    setSimulating(true);
    try {
      const result = await api.simulateIntervention(
        currentState,
        action,
        {
          target_variable: interventionVar,
          forced_value: interventionVal,
          start_step: 0,
          horizon: horizon,
        },
        environment
      );
      setPrediction(result.prediction);

      const chartData = result.prediction.steps.map((step, i) => ({
        step: i + 1,
        temp_mean: step.variables.temperature_c?.mean,
        temp_lo: step.variables.temperature_c?.lo_90,
        temp_hi: step.variables.temperature_c?.hi_90,
        pressure_mean: step.variables.pressure_bar?.mean,
        power_mean: step.variables.power_kw?.mean,
        vibration_mean: step.variables.vibration_mm_s?.mean,
      }));
      setTrajectoryData(chartData);

      // Broadcast interventional state to PC1 floor plan
      if (result.prediction.steps.length > 0) {
        const lastStep = result.prediction.steps[result.prediction.steps.length - 1];
        const nextState = {
          temperature_c: lastStep.variables.temperature_c?.mean ?? currentState.temperature_c,
          pressure_bar: lastStep.variables.pressure_bar?.mean ?? currentState.pressure_bar,
          power_kw: lastStep.variables.power_kw?.mean ?? currentState.power_kw,
          vibration_mm_s: lastStep.variables.vibration_mm_s?.mean ?? currentState.vibration_mm_s,
        };
        setCurrentState((prev) => ({ ...prev, ...nextState }));
        await broadcastSync(nextState);
      }
    } catch (err) {
      console.error('Intervention failed:', err);
    }
    setSimulating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  const sliderStyle = {
    backgroundColor: 'var(--bg-tertiary)',
    accentColor: 'var(--accent)',
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-6">
        <Link href="/dashboard" className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          Orgs
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <Link href={`/dashboard/${orgSlug}`} className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          Branches
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <Link href={`/dashboard/${orgSlug}/${branchId}`} className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          Canvas
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span style={{ color: 'var(--text-primary)' }} className="font-medium">
          {machine?.label}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {machine?.label}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Causal World Model & Simulation Engine
          </p>
        </div>

        {/* Multi-Screen Live Sync Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-600 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>PC2 Simulation Live • Broadcasting to Floor Plan (PC1)</span>
        </div>
      </div>

      {/* Current State Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Temperature', value: `${currentState.temperature_c.toFixed(1)}°C`, icon: Thermometer, color: '#ef4444' },
          { label: 'Pressure', value: `${currentState.pressure_bar.toFixed(2)} bar`, icon: Gauge, color: '#3b82f6' },
          { label: 'Power', value: `${currentState.power_kw.toFixed(1)} kW`, icon: Zap, color: '#f59e0b' },
          { label: 'Vibration', value: `${currentState.vibration_mm_s.toFixed(2)} mm/s`, icon: Activity, color: '#8b5cf6' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <metric.icon className="w-4 h-4" style={{ color: metric.color }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {metric.label}
              </span>
            </div>
            <p className="text-lg font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
           style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {(['predict', 'intervene'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150"
            style={{
              backgroundColor: activeTab === tab ? 'var(--bg-primary)' : 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab ? '0 1px 2px var(--shadow-color)' : 'none',
            }}
          >
            {tab === 'predict' ? 'Predict' : 'Intervene'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Control Panel */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
            <Sliders className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Controls
          </h3>

          <div className="space-y-4">
            {/* Machine Load */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>Machine Load</span>
                <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {action.machine_load}%
                </span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={action.machine_load}
                onChange={(e) => setAction({ ...action, machine_load: +e.target.value })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={sliderStyle}
              />
            </div>

            {/* Fan Speed */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>Fan Speed</span>
                <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {action.fan_speed}%
                </span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={action.fan_speed}
                onChange={(e) => setAction({ ...action, fan_speed: +e.target.value })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={sliderStyle}
              />
            </div>

            {/* Coolant Flow */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>Coolant Flow</span>
                <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {action.coolant_flow}%
                </span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={action.coolant_flow}
                onChange={(e) => setAction({ ...action, coolant_flow: +e.target.value })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={sliderStyle}
              />
            </div>

            {/* Ambient Temp */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>Ambient Temp</span>
                <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {environment.ambient_temperature}°C
                </span>
              </div>
              <input
                type="range" min={5} max={50} step={0.5}
                value={environment.ambient_temperature}
                onChange={(e) => setEnvironment({ ambient_temperature: +e.target.value })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={sliderStyle}
              />
            </div>

            {/* Horizon */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>Horizon (steps)</span>
                <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {horizon}
                </span>
              </div>
              <input
                type="range" min={1} max={30} step={1}
                value={horizon}
                onChange={(e) => setHorizon(+e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={sliderStyle}
              />
            </div>

            {/* Intervention-specific controls */}
            {activeTab === 'intervene' && (
              <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  INTERVENTION do(X = x)
                </h4>
                <div className="mb-3">
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Target Variable
                  </label>
                  <select
                    value={interventionVar}
                    onChange={(e) => setInterventionVar(e.target.value as IntervenableVariable)}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="fan_speed">Fan Speed</option>
                    <option value="coolant_flow">Coolant Flow</option>
                    <option value="machine_load">Machine Load</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Forced Value</span>
                    <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                      {interventionVal}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={interventionVal}
                    onChange={(e) => setInterventionVal(+e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={sliderStyle}
                  />
                </div>
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={activeTab === 'predict' ? handlePredict : handleIntervene}
              disabled={simulating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-50 mt-2"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-text)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
            >
              {simulating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {activeTab === 'predict' ? 'Run Prediction' : 'Run Intervention'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Chart Panel */}
        <div
          className="lg:col-span-2 rounded-xl border p-5"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
            <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Temperature Prediction with 90% Uncertainty Band
          </h3>

          {trajectoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={trajectoryData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="step"
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  label={{ value: 'Step', position: 'insideBottom', offset: -5, fill: 'var(--text-tertiary)', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  label={{ value: '°C', angle: -90, position: 'insideLeft', fill: 'var(--text-tertiary)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
                {/* 90% confidence band */}
                <Area
                  dataKey="temp_lo"
                  stackId="band"
                  fill="transparent"
                  stroke="none"
                />
                <Area
                  dataKey="temp_hi"
                  stackId="band"
                  fill="#6366f130"
                  stroke="none"
                  name="90% CI"
                />
                {/* Mean line */}
                <Line
                  dataKey="temp_mean"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#6366f1' }}
                  name="Temperature (Mean)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px]">
              <div className="text-center">
                <Activity className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Adjust controls and click &quot;Run&quot; to see predictions
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>
                  Every prediction includes uncertainty bands
                </p>
              </div>
            </div>
          )}

          {/* Prediction metadata */}
          {prediction && (
            <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3"
                 style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Ability</span>
                <p className="text-sm font-mono font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {prediction.ability}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Steps</span>
                <p className="text-sm font-mono font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {prediction.steps.length}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Assumptions</span>
                <p className="text-sm font-mono font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {prediction.assumptions?.join(', ') || 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Reliability</span>
                <p className="text-sm font-medium mt-0.5" style={{
                  color: prediction.steps[0]?.reliability_level === 'high'
                    ? 'var(--success)'
                    : prediction.steps[0]?.reliability_level === 'medium'
                      ? 'var(--warning)'
                      : 'var(--danger)',
                }}>
                  {prediction.steps[0]?.reliability_level || 'N/A'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
