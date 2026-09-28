'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Flame,
  Gauge,
  GitBranch,
  HelpCircle,
  History,
  Layers,
  Play,
  RotateCcw,
  Send,
  Sliders,
  Sparkles,
  Zap
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
  Legend
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
  ReliabilityLevel
} from '@simulens/shared';
import { api } from '@/lib/api';

export default function SimuLensDashboard() {
  // Simulator current state
  const [currentState, setCurrentState] = useState<SystemState>({
    temperature_c: 65.0,
    pressure_bar: 3.5,
    power_kw: 11.2,
    vibration_mm_s: 0.85,
    cooling_efficiency: 95.0,
  });

  const [currentAction, setCurrentAction] = useState<ControllableAction>({
    machine_load: 50.0,
    fan_speed: 40.0,
    coolant_flow: 40.0,
    cooling_setpoint: 65.0,
  });

  const [currentEnv, setCurrentEnv] = useState<EnvironmentCondition>({
    ambient_temperature: 25.0,
  });

  // Active view tab: 'overview' | 'intervention' | 'counterfactual' | 'causal_graph' | 'validation'
  const [activeTab, setActiveTab] = useState<'overview' | 'intervention' | 'counterfactual' | 'causal_graph' | 'validation'>('overview');

  // Prediction and evaluation state
  const [predictionEnvelope, setPredictionEnvelope] = useState<PredictionEnvelope | null>(null);
  const [actualTelemetry, setActualTelemetry] = useState<TelemetryStep[]>([]);
  const [validationMetrics, setValidationMetrics] = useState<ValidationSummary | null>(null);
  const [historyEpisodes, setHistoryEpisodes] = useState<TelemetryStep[]>([]);

  // Intervention controls
  const [interveneVar, setInterveneVar] = useState<'fan_speed' | 'machine_load' | 'coolant_flow'>('fan_speed');
  const [interveneVal, setInterveneVal] = useState<number>(75);
  const [interveneHorizon, setInterveneHorizon] = useState<number>(6);
  const [severedEdges, setSeveredEdges] = useState<Array<{ source: string; target: string }>>([]);

  // Counterfactual state
  const [cfChangeStep, setCfChangeStep] = useState<number>(2);
  const [cfVar, setCfVar] = useState<'fan_speed' | 'machine_load' | 'coolant_flow'>('fan_speed');
  const [cfNewVal, setCfNewVal] = useState<number>(80);
  const [cfResult, setCfResult] = useState<any | null>(null);

  // Causal DAG spec
  const [causalGraph, setCausalGraph] = useState<CausalGraphSpec | null>(null);

  // OpenRouter AI natural language interface
  const [aiPrompt, setAiPrompt] = useState<string>('Increase fan speed to 75% and evaluate cooling effect');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('System nominal. Ready for simulation.');

  // Fetch initial simulator state & causal graph on mount
  useEffect(() => {
    async function init() {
      try {
        const initData = await api.getInitialState();
        setCurrentState(initData.state);
        setCurrentAction(initData.action);
        setCurrentEnv(initData.environment);

        // Run an initial next-state prediction
        const pred = await api.predictNextState(initData.state, initData.action, initData.environment);
        setPredictionEnvelope(pred);

        // Fetch causal DAG
        const dag = await api.getCausalGraph();
        setCausalGraph(dag);

        // Generate a 10-step recorded history episode for immediate counterfactual demo
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
        console.error('Initialization error:', err);
      }
    }
    init();
  }, []);

  // Handle single-step physical simulation
  const handleStepSimulation = async () => {
    setLoading(true);
    try {
      const res = await api.stepSimulation(currentState, currentAction, currentEnv);
      setCurrentState(res.observed.state);
      setCurrentEnv(res.observed.environment);

      // Auto-update next-state prediction envelope
      const nextPred = await api.predictNextState(res.observed.state, currentAction, res.observed.environment);
      setPredictionEnvelope(nextPred);
      setStatusMessage(`Step t=${res.t} simulated. Temp: ${res.observed.state.temperature_c}°C`);
    } catch (err: any) {
      setStatusMessage(`Simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Run Intervention do(X = x)
  const handleRunIntervention = async () => {
    setLoading(true);
    setStatusMessage(`Running intervention do(${interveneVar} = ${interveneVal}%)...`);
    try {
      const spec: InterventionSpec = {
        target_variable: interveneVar,
        forced_value: interveneVal,
        start_step: 0,
        horizon: interveneHorizon,
      };

      const res = await api.simulateIntervention(currentState, currentAction, spec, currentEnv);
      setPredictionEnvelope(res.prediction);
      setSeveredEdges(res.graphSurgery.severedEdges);

      // Run actual simulator with intervened actions to compare predicted vs ground truth!
      const intervenedActions = Array(interveneHorizon).fill({
        ...currentAction,
        [interveneVar]: interveneVal,
      });
      const simActual = await api.runSimulation(currentState, intervenedActions, currentEnv);
      setActualTelemetry(simActual.trajectory);

      // Compute validation metrics
      const val = await api.evaluateValidation(res.prediction, simActual.trajectory);
      setValidationMetrics(val);

      setStatusMessage(`Intervention complete. Severed ${res.graphSurgery.severedEdges.length} edges. MAE: ${val.mae.temperature_c}°C`);
    } catch (err: any) {
      setStatusMessage(`Intervention error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Run Counterfactual Replay
  const handleRunCounterfactual = async () => {
    if (historyEpisodes.length < 2) return;
    setLoading(true);
    setStatusMessage(`Abducting historical residuals and replaying counterfactual...`);
    try {
      const recorded_steps = [
        {
          t: 0,
          machine_load: currentAction.machine_load,
          fan_speed: currentAction.fan_speed,
          coolant_flow: currentAction.coolant_flow,
          ambient_temperature: currentEnv.ambient_temperature,
          ...currentState,
        },
        ...historyEpisodes.map((step) => ({
          t: step.t,
          machine_load: step.action.machine_load,
          fan_speed: step.action.fan_speed,
          coolant_flow: step.action.coolant_flow,
          ambient_temperature: step.environment.ambient_temperature,
          ...step.state,
        })),
      ];

      const spec: CounterfactualSpec = {
        change_step: cfChangeStep,
        changed_variable: cfVar,
        new_value: cfNewVal,
        recorded_steps,
      };

      const res = await api.runCounterfactual(spec);
      setCfResult(res);
      setStatusMessage(
        `Counterfactual complete. If ${cfVar} had been ${cfNewVal}% at t=${cfChangeStep}, temp would diverge by ${res.divergenceSummary.temperatureDiff}°C`
      );
    } catch (err: any) {
      setStatusMessage(`Counterfactual error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // OpenRouter NL AI Query Execution
  const handleExecuteAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.interpretWithAI(aiPrompt);
      setAiResponse(`${res.summary}\n\n[Rationale]: ${res.reasoning_rationale}`);

      // If an intervention was recognized, configure the intervention panel automatically!
      if (res.recognized_action) {
        setInterveneVar(res.recognized_action.variable as any);
        setInterveneVal(res.recognized_action.value);
        setInterveneHorizon(res.recognized_action.horizon || 6);
        setActiveTab('intervention');
      }
    } catch (err: any) {
      setAiResponse(`AI Error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Format chart data for Prediction vs Actual and Uncertainty Bands
  const chartData = React.useMemo(() => {
    if (!predictionEnvelope) return [];
    return predictionEnvelope.steps.map((pStep, index) => {
      const actual = actualTelemetry[index]?.state;
      const tVar = pStep.variables.temperature_c;
      return {
        step: `t+${pStep.step}`,
        predicted_mean: tVar.mean,
        band_lo_90: tVar.lo_90,
        band_hi_90: tVar.hi_90,
        band_range: [tVar.lo_90, tVar.hi_90],
        actual: actual?.temperature_c ?? null,
      };
    });
  }, [predictionEnvelope, actualTelemetry]);

  // Format counterfactual chart data
  const cfChartData = React.useMemo(() => {
    if (!cfResult) return [];
    return cfResult.actualTrajectory.map((act: any, idx: number) => {
      const cf = cfResult.counterfactualTrajectory[idx];
      return {
        step: `t=${act.t}`,
        actualTemp: act.state.temperature_c,
        cfTemp: cf.state.temperature_c,
        actualPower: act.state.power_kw,
        cfPower: cf.state.power_kw,
      };
    });
  }, [cfResult]);

  const currentReliability: ReliabilityLevel = predictionEnvelope?.steps[0]?.reliability_level ?? 'high';
  const reliabilityReason = predictionEnvelope?.steps[0]?.reliability_reason ?? 'Operating point nominal';

  return (
    <div className="flex flex-col min-h-screen bg-[#080d19] text-slate-100">
      {/* Top Engineering Navbar */}
      <header className="border-b border-[#1b253b] bg-[#0c1424] px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-sky-500/20 text-sky-400 p-2 rounded-lg border border-sky-500/30">
            <Cpu className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">SimuLens</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                v0.1.0 MVP
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Uncertainty-Aware Causal World Model & Intervention Engine
            </p>
          </div>
        </div>

        {/* Reliability indicator pill */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono bg-[#111c30]">
            <span className="text-slate-400 font-sans">Reliability:</span>
            {currentReliability === 'high' && (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> HIGH
              </span>
            )}
            {currentReliability === 'medium' && (
              <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> MEDIUM
              </span>
            )}
            {currentReliability === 'low' && (
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span> LOW (OOD)
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400 border-l border-[#1b253b] pl-4 hidden md:block">
            <span className="font-mono text-slate-300">Seed:</span> 42 &bull; <span className="font-mono text-slate-300">Domain:</span> cooling_system
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left Column: Live Plant Telemetry & Controllable Controls */}
        <aside className="lg:col-span-3 border-r border-[#1b253b] bg-[#0b1220] p-4 flex flex-col gap-5 overflow-y-auto">
          {/* Machine State Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-sky-400" /> Plant Telemetry (Step t)
              </h2>
              <button
                onClick={handleStepSimulation}
                disabled={loading}
                className="text-xs flex items-center gap-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition"
              >
                <Play className="w-3 h-3 fill-current" /> Step
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b]">
                <div className="text-slate-400 flex items-center justify-between">
                  <span>Temperature</span>
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-bold text-white mt-1">
                  {currentState.temperature_c.toFixed(1)} <span className="text-xs font-normal text-slate-400">°C</span>
                </div>
              </div>

              <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b]">
                <div className="text-slate-400 flex items-center justify-between">
                  <span>Pressure</span>
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-lg font-bold text-white mt-1">
                  {currentState.pressure_bar.toFixed(2)} <span className="text-xs font-normal text-slate-400">bar</span>
                </div>
              </div>

              <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b]">
                <div className="text-slate-400 flex items-center justify-between">
                  <span>Power Draw</span>
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div className="text-lg font-bold text-white mt-1">
                  {currentState.power_kw.toFixed(1)} <span className="text-xs font-normal text-slate-400">kW</span>
                </div>
              </div>

              <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b]">
                <div className="text-slate-400 flex items-center justify-between">
                  <span>Vibration</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-lg font-bold text-white mt-1">
                  {currentState.vibration_mm_s.toFixed(2)} <span className="text-xs font-normal text-slate-400">mm/s</span>
                </div>
              </div>
            </div>

            <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b] mt-2 text-xs">
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Cooling Efficiency</span>
                <span className="text-sky-300 font-mono">{currentState.cooling_efficiency}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sky-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${currentState.cooling_efficiency}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Plant Controls */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-sky-400" /> Controllable Actions (A_t)
            </h2>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Machine Load (L)</span>
                  <span className="font-mono text-sky-400 font-bold">{currentAction.machine_load}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentAction.machine_load}
                  onChange={(e) => setCurrentAction({ ...currentAction, machine_load: Number(e.target.value) })}
                  className="w-full accent-sky-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Fan Speed (F)</span>
                  <span className="font-mono text-cyan-400 font-bold">{currentAction.fan_speed}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentAction.fan_speed}
                  onChange={(e) => setCurrentAction({ ...currentAction, fan_speed: Number(e.target.value) })}
                  className="w-full accent-cyan-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Coolant Pump Flow (C)</span>
                  <span className="font-mono text-blue-400 font-bold">{currentAction.coolant_flow}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentAction.coolant_flow}
                  onChange={(e) => setCurrentAction({ ...currentAction, coolant_flow: Number(e.target.value) })}
                  className="w-full accent-blue-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="bg-[#111c30] p-2.5 rounded border border-[#1b253b]">
                <div className="flex justify-between text-slate-300">
                  <span>Ambient Temp (Ta)</span>
                  <span className="font-mono text-amber-400">{currentEnv.ambient_temperature}°C</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="45"
                  value={currentEnv.ambient_temperature}
                  onChange={(e) => setCurrentEnv({ ambient_temperature: Number(e.target.value) })}
                  className="w-full accent-amber-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer mt-1"
                />
              </div>
            </div>
          </div>

          {/* Natural Language What-If Prompt Drawer */}
          <div className="mt-auto bg-[#111c30] p-3 rounded-lg border border-[#1b253b]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> OpenRouter Causal Copilot
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Type what-if scenarios in natural language. Translated into structured intervention $do()$.
            </p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Set fan to 80% on high load..."
                className="flex-1 bg-[#090d16] border border-[#1b253b] rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                onClick={handleExecuteAI}
                disabled={aiLoading}
                className="bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-1.5 rounded text-xs transition"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
            {aiResponse && (
              <div className="mt-2 p-2 bg-[#090d16] rounded border border-sky-950 text-[11px] text-slate-300 font-mono whitespace-pre-wrap">
                {aiResponse}
              </div>
            )}
          </div>
        </aside>

        {/* Center / Right Workspace: 4 Abilities, Charts, Causal DAG, and Validation */}
        <main className="lg:col-span-9 p-5 flex flex-col gap-5 overflow-y-auto">
          {/* Navigation Bar for 4 Abilities */}
          <div className="flex items-center justify-between border-b border-[#1b253b] pb-3">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  activeTab === 'overview'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111c30] text-slate-300 hover:bg-[#182642]'
                }`}
              >
                1. Prediction & Envelope
              </button>
              <button
                onClick={() => setActiveTab('intervention')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  activeTab === 'intervention'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111c30] text-slate-300 hover:bg-[#182642]'
                }`}
              >
                2. Intervention Engine do()
              </button>
              <button
                onClick={() => setActiveTab('counterfactual')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  activeTab === 'counterfactual'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111c30] text-slate-300 hover:bg-[#182642]'
                }`}
              >
                3. Counterfactual Replay
              </button>
              <button
                onClick={() => setActiveTab('causal_graph')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  activeTab === 'causal_graph'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111c30] text-slate-300 hover:bg-[#182642]'
                }`}
              >
                4. Causal DAG
              </button>
              <button
                onClick={() => setActiveTab('validation')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  activeTab === 'validation'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111c30] text-slate-300 hover:bg-[#182642]'
                }`}
              >
                5. Validation Metrics
              </button>
            </div>

            <div className="text-xs text-slate-400 font-mono hidden sm:block">
              Status: <span className="text-slate-200">{statusMessage}</span>
            </div>
          </div>

          {/* TAB 1: PREDICTION & UNCERTAINTY ENVELOPE */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#111c30] border border-[#1b253b] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-sky-400" /> Next-State Prediction Envelope P(S_t+1 | S_t)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Explicit uncertainty bounds derived from physical sensor noise and epistemic OOD distance.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-slate-400">Region: </span>
                    <span className="text-xs font-mono text-sky-400 font-bold">
                      {predictionEnvelope?.steps[0]?.region_key ?? 'REG-NOMINAL'}
                    </span>
                  </div>
                </div>

                {/* Envelope variable grid */}
                {predictionEnvelope && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono mt-3">
                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <div className="text-slate-400">Temperature Expected</div>
                      <div className="text-base font-bold text-white mt-1">
                        {predictionEnvelope.steps[0].variables.temperature_c.mean}°C
                      </div>
                      <div className="text-[11px] text-sky-400 mt-1">
                        90% CI: [{predictionEnvelope.steps[0].variables.temperature_c.lo_90} - {predictionEnvelope.steps[0].variables.temperature_c.hi_90}°C]
                      </div>
                    </div>

                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <div className="text-slate-400">Pressure Expected</div>
                      <div className="text-base font-bold text-white mt-1">
                        {predictionEnvelope.steps[0].variables.pressure_bar.mean} bar
                      </div>
                      <div className="text-[11px] text-cyan-400 mt-1">
                        90% CI: [{predictionEnvelope.steps[0].variables.pressure_bar.lo_90} - {predictionEnvelope.steps[0].variables.pressure_bar.hi_90} bar]
                      </div>
                    </div>

                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <div className="text-slate-400">Power Expected</div>
                      <div className="text-base font-bold text-white mt-1">
                        {predictionEnvelope.steps[0].variables.power_kw.mean} kW
                      </div>
                      <div className="text-[11px] text-yellow-400 mt-1">
                        90% CI: [{predictionEnvelope.steps[0].variables.power_kw.lo_90} - {predictionEnvelope.steps[0].variables.power_kw.hi_90} kW]
                      </div>
                    </div>

                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <div className="text-slate-400">Uncertainty Breakdown</div>
                      <div className="text-[11px] text-slate-300 mt-1">
                        Aleatoric $\sigma$: {predictionEnvelope.steps[0].variables.temperature_c.aleatoric_std}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        Epistemic $\sigma$: {predictionEnvelope.steps[0].variables.temperature_c.epistemic_std}
                      </div>
                    </div>
                  </div>
                )}

                {/* Assumptions notice */}
                <div className="mt-3 p-2 bg-[#090d16] rounded border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Explicit Causal Assumptions Active: <strong className="text-slate-200">{predictionEnvelope?.assumptions.join(', ')}</strong> (documented in docs/ASSUMPTIONS.md)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERVENTION ENGINE do() */}
          {activeTab === 'intervention' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#111c30] border border-[#1b253b] rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-sky-400" /> Intervention Engine — Pearl&apos;s do(X = x)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Forces variable value regardless of its normal causal parents via graph surgery.
                    </p>
                  </div>
                  <button
                    onClick={handleRunIntervention}
                    disabled={loading}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium text-xs flex items-center gap-1.5 transition self-start sm:self-auto"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Run do({interveneVar} = {interveneVal}%)
                  </button>
                </div>

                {/* Intervention controls bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#0b1220] rounded border border-[#1b253b] text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Target Variable to Force</label>
                    <select
                      value={interveneVar}
                      onChange={(e) => setInterveneVar(e.target.value as any)}
                      className="w-full bg-[#111c30] border border-[#1b253b] rounded p-1.5 text-white font-mono"
                    >
                      <option value="fan_speed">Fan Speed (%)</option>
                      <option value="machine_load">Machine Load (%)</option>
                      <option value="coolant_flow">Coolant Flow (%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Forced Value ({interveneVal}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={interveneVal}
                      onChange={(e) => setInterveneVal(Number(e.target.value))}
                      className="w-full accent-sky-500 mt-2"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Rollout Horizon ({interveneHorizon} steps)</label>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      value={interveneHorizon}
                      onChange={(e) => setInterveneHorizon(Number(e.target.value))}
                      className="w-full accent-sky-500 mt-2"
                    />
                  </div>
                </div>

                {/* Severed Edges surgery notice */}
                {severedEdges.length > 0 && (
                  <div className="mt-3 p-2.5 bg-sky-950/40 border border-sky-800 rounded text-xs font-mono text-sky-300 flex items-center gap-2">
                    <span className="font-bold">Graph Surgery:</span>
                    <span>
                      Severed incoming edges: {severedEdges.map((e) => `${e.source} ↛ ${e.target}`).join(', ')}
                    </span>
                  </div>
                )}

                {/* Trajectory comparison chart */}
                {chartData.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-mono text-slate-300 mb-2">
                      Predicted Interventional Trajectory vs Simulator Ground Truth
                    </h4>
                    <div className="h-64 w-full bg-[#0b1220] rounded p-2 border border-[#1b253b]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" />
                          <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis domain={['auto', 'auto']} stroke="#64748b" tick={{ fontSize: 11 }} unit="°C" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                          <Area
                            type="monotone"
                            dataKey="band_range"
                            name="90% Uncertainty Envelope"
                            fill="#0284c7"
                            fillOpacity={0.2}
                            stroke="none"
                          />
                          <Line
                            type="monotone"
                            dataKey="predicted_mean"
                            name="Predicted Temperature"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            name="Simulator Ground Truth"
                            stroke="#10b981"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={{ r: 3 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COUNTERFACTUAL ENGINE */}
          {activeTab === 'counterfactual' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#111c30] border border-[#1b253b] rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-sky-400" /> Counterfactual Reasoning (Pearl Ladder Rung 3)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      “In this recorded episode, what would have happened if we had acted differently at step k?”
                    </p>
                  </div>
                  <button
                    onClick={handleRunCounterfactual}
                    disabled={loading}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium text-xs flex items-center gap-1.5 transition self-start sm:self-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Replay Counterfactual
                  </button>
                </div>

                {/* Counterfactual query controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#0b1220] rounded border border-[#1b253b] text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Intervention Point (Step k)</label>
                    <select
                      value={cfChangeStep}
                      onChange={(e) => setCfChangeStep(Number(e.target.value))}
                      className="w-full bg-[#111c30] border border-[#1b253b] rounded p-1.5 text-white font-mono"
                    >
                      {historyEpisodes.map((step) => (
                        <option key={step.t} value={step.t}>
                          Step t={step.t} (Historical load {step.action.machine_load}%, fan {step.action.fan_speed}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Counterfactual Variable</label>
                    <select
                      value={cfVar}
                      onChange={(e) => setCfVar(e.target.value as any)}
                      className="w-full bg-[#111c30] border border-[#1b253b] rounded p-1.5 text-white font-mono"
                    >
                      <option value="fan_speed">Fan Speed (%)</option>
                      <option value="machine_load">Machine Load (%)</option>
                      <option value="coolant_flow">Coolant Flow (%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Alternate Value ({cfNewVal}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={cfNewVal}
                      onChange={(e) => setCfNewVal(Number(e.target.value))}
                      className="w-full accent-sky-500 mt-2"
                    />
                  </div>
                </div>

                {/* Counterfactual Results Comparison */}
                {cfResult && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                      <div className="bg-[#0b1220] p-2.5 rounded border border-[#1b253b]">
                        <span className="text-slate-400">Temp Divergence</span>
                        <div className="text-sm font-bold text-sky-400 mt-1">
                          {cfResult.divergenceSummary.temperatureDiff > 0 ? '+' : ''}
                          {cfResult.divergenceSummary.temperatureDiff}°C
                        </div>
                      </div>
                      <div className="bg-[#0b1220] p-2.5 rounded border border-[#1b253b]">
                        <span className="text-slate-400">Power Divergence</span>
                        <div className="text-sm font-bold text-yellow-400 mt-1">
                          {cfResult.divergenceSummary.powerDiff > 0 ? '+' : ''}
                          {cfResult.divergenceSummary.powerDiff} kW
                        </div>
                      </div>
                      <div className="bg-[#0b1220] p-2.5 rounded border border-[#1b253b]">
                        <span className="text-slate-400">Efficiency Shift</span>
                        <div className="text-sm font-bold text-emerald-400 mt-1">
                          {cfResult.divergenceSummary.coolingEfficiencyDiff > 0 ? '+' : ''}
                          {cfResult.divergenceSummary.coolingEfficiencyDiff}%
                        </div>
                      </div>
                      <div className="bg-[#0b1220] p-2.5 rounded border border-[#1b253b]">
                        <span className="text-slate-400">Abducted Steps</span>
                        <div className="text-sm font-bold text-slate-200 mt-1">
                          {cfResult.abductedResiduals.length} shocks
                        </div>
                      </div>
                    </div>

                    <div className="h-64 w-full bg-[#0b1220] rounded p-2 border border-[#1b253b]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={cfChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" />
                          <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="°C" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                          <Line
                            type="monotone"
                            dataKey="actualTemp"
                            name="Actual Recorded History"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="cfTemp"
                            name={`Counterfactual (${cfVar}=${cfNewVal}%)`}
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CAUSAL DAG VISUALIZATION */}
          {activeTab === 'causal_graph' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#111c30] border border-[#1b253b] rounded-lg p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Brain className="w-4 h-4 text-sky-400" /> Explicit Causal DAG Specification
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Structure-respecting causal relationships. Direct causes dictate structural mechanisms.
                  </p>
                </div>

                {causalGraph && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nodes list */}
                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                        Graph Nodes ({causalGraph.nodes.length})
                      </h4>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {causalGraph.nodes.map((node) => (
                          <div
                            key={node.id}
                            className="flex items-center justify-between p-2 rounded bg-[#111c30] text-xs font-mono"
                          >
                            <span className="text-white font-medium">{node.label}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-sky-400">
                              {node.type} ({node.unit})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Edges list */}
                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                        Directed Causal Edges ({causalGraph.edges.length})
                      </h4>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {causalGraph.edges.map((edge, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded bg-[#111c30] text-xs font-mono"
                          >
                            <span className="text-sky-300">
                              {edge.source} &rarr; {edge.target}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{edge.notes}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Vital Causal Demonstration Box */}
                <div className="mt-4 p-3 bg-amber-950/20 border border-amber-800/50 rounded-lg text-xs">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Crucial Causal Demonstration (Correlation != Causation)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Notice that <code className="text-amber-300">vibration &rarr; machine_temperature</code> is <strong>strictly absent</strong> from the DAG! Vibration correlates strongly with temperature in observational telemetry (due to shared common causes Load $L$ and Fouling $\phi$), but is a pure effect. Intervening on vibration produces <strong>zero</strong> causal change in temperature!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: VALIDATION & ERROR METRICS */}
          {activeTab === 'validation' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#111c30] border border-[#1b253b] rounded-lg p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Prediction-vs-Actual Validation
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated directly against deterministic simulator ground truth. Every metric is computed, never fabricated.
                  </p>
                </div>

                {validationMetrics ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                        <span className="text-xs text-slate-400">Temperature MAE</span>
                        <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                          {validationMetrics.mae.temperature_c} <span className="text-xs font-normal">°C</span>
                        </div>
                      </div>
                      <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                        <span className="text-xs text-slate-400">Temperature RMSE</span>
                        <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                          {validationMetrics.rmse.temperature_c} <span className="text-xs font-normal">°C</span>
                        </div>
                      </div>
                      <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                        <span className="text-xs text-slate-400">90% Interval Coverage (PICP-90)</span>
                        <div className="text-xl font-bold font-mono text-sky-400 mt-1">
                          {(validationMetrics.picp_90.temperature_c * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#0b1220] p-3 rounded border border-[#1b253b]">
                      <h4 className="text-xs font-mono text-slate-300 mb-2">Step-by-Step Validation Comparisons</h4>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs font-mono text-left">
                          <thead className="bg-[#111c30] text-slate-400 border-b border-[#1b253b]">
                            <tr>
                              <th className="p-2">Step</th>
                              <th className="p-2">Variable</th>
                              <th className="p-2">Predicted Mean</th>
                              <th className="p-2">Actual Ground Truth</th>
                              <th className="p-2">Error</th>
                              <th className="p-2">Inside 90% Band</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {validationMetrics.comparisons.map((cmp, i) => (
                              <tr key={i} className="hover:bg-[#111c30]/50">
                                <td className="p-2 text-slate-400">t+{cmp.horizon_step}</td>
                                <td className="p-2 text-sky-300">{cmp.variable}</td>
                                <td className="p-2">{cmp.predicted_mean}</td>
                                <td className="p-2 text-emerald-400 font-bold">{cmp.actual_value}</td>
                                <td className="p-2 text-slate-300">{cmp.error}</td>
                                <td className="p-2">
                                  {cmp.in_interval_90 ? (
                                    <span className="text-emerald-400 font-bold">YES</span>
                                  ) : (
                                    <span className="text-rose-400 font-bold">NO</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 font-mono">
                    Run an intervention or action-conditioned prediction to generate ground truth validation metrics.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
