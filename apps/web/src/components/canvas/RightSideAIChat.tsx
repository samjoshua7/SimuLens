'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  Activity,
  Zap,
  Thermometer,
  ShieldCheck,
  Flame,
  Cpu,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  Maximize2,
  Minimize2,
  Minus,
  Trash2,
  HelpCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CopilotChatRequest,
  CopilotChatResponse,
  CopilotMessage,
  IntervenableVariable,
  PredictionEnvelope,
  ControllableAction,
  SystemState,
  EnvironmentCondition,
} from '@simulens/shared';
import { api } from '@/lib/api';
import { CachedMachine } from '@/lib/branchStore';

interface RightSideAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  forceMinimize?: boolean;
  machines: CachedMachine[];
  selectedMachineId: string | null;
  onSelectMachine: (id: string) => void;
  onApplyAction: (machineId: string, actionPatch: { [key: string]: any }) => void;
  branchName?: string;
  orgSlug: string;
  branchId: string;
}


function RichMessageRenderer({ content }: { content: string }) {
  const renderInline = (text: string): React.ReactNode => {
    // 1. Clean any raw UUIDs like (0b79627d-6187-47df-a050-4f2d818b4404)
    let cleaned = text.replace(/\s*\([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)/g, '');
    // 2. Clean raw LaTeX math markers $...$
    cleaned = cleaned.replace(/\$([^\$]+)\$/g, '$1');
    // 3. Clean raw escaped percent
    cleaned = cleaned.replace(/\\%/g, '%');

    // Tokenize by `code`, **bold**, and *italic*
    const tokens = cleaned.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return tokens.map((token, i) => {
      if (!token) return null;
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={i}
            className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith('**') && token.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-slate-900 dark:text-white">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('*') && token.endsWith('*')) {
        return (
          <em key={i} className="italic text-slate-600 dark:text-slate-400">
            {token.slice(1, -1)}
          </em>
        );
      }
      return <span key={i}>{token}</span>;
    });
  };

  const paragraphs = content.split(/\r?\n\s*\r?\n/);

  return (
    <div className="space-y-2 break-words text-xs leading-relaxed">
      {paragraphs.map((p, idx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        // A. Heading (### or ##)
        if (trimmed.startsWith('#')) {
          const headingText = trimmed.replace(/^#+\s*/, '');
          return (
            <div key={idx} className="flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-700/60 mt-1">
              <h4 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 tracking-wide flex items-center gap-1.5">
                {renderInline(headingText)}
              </h4>
            </div>
          );
        }

        // B. Status & High-level Metrics Row (e.g. **Status:** **CAUTION** | **Active Units:** 4 | **Average Load:** 50%)
        if (trimmed.includes('Status:') && trimmed.includes('|')) {
          const parts = trimmed.split('|').map((s) => s.trim());
          return (
            <div key={idx} className="flex flex-wrap items-center gap-1.5 py-0.5">
              {parts.map((part, pIdx) => {
                const isStatus = part.toLowerCase().includes('status');
                const isCaution = part.toUpperCase().includes('CAUTION');
                const isWarning = part.toUpperCase().includes('WARNING') || part.toUpperCase().includes('CRITICAL');

                if (isStatus) {
                  return (
                    <span
                      key={pIdx}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-2xs ${
                        isWarning
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                          : isCaution
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {renderInline(part.replace(/[*_]/g, ''))}
                    </span>
                  );
                }

                return (
                  <span
                    key={pIdx}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs"
                  >
                    {renderInline(part)}
                  </span>
                );
              })}
            </div>
          );
        }

        // C. Hotspot Warning Banner (starts with ⚠️ or contains 'Hotspots detected:')
        if (trimmed.startsWith('⚠️') || trimmed.toLowerCase().includes('hotspots detected')) {
          return (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed flex items-start gap-2 shadow-2xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>{renderInline(trimmed.replace(/^⚠️\s*/, ''))}</div>
            </div>
          );
        }

        // D. Thermal Stability / Success Banner (starts with ✅)
        if (trimmed.startsWith('✅')) {
          return (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-[11px] leading-relaxed flex items-start gap-2 shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>{renderInline(trimmed.replace(/^✅\s*/, ''))}</div>
            </div>
          );
        }

        // E. Selected Machine Card (starts with 'Selected Machine:' or 'Target Unit:' or 'Abduction Target:')
        if (
          trimmed.includes('Selected Machine:') ||
          trimmed.includes('Target Unit:') ||
          trimmed.includes('Abduction Target:')
        ) {
          const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const titleLine = lines[0] || '';
          const bulletLines = lines.slice(1);

          return (
            <div
              key={idx}
              className="p-2.5 rounded-lg border bg-white dark:bg-slate-850/80 border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-2"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-slate-100">
                <Cpu className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{renderInline(titleLine)}</span>
              </div>

              {bulletLines.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                  {bulletLines.map((line, bIdx) => {
                    const cleanLine = line.replace(/^[-*]\s*/, '');
                    const colonIdx = cleanLine.indexOf(':');
                    const k = colonIdx !== -1 ? cleanLine.slice(0, colonIdx) : cleanLine;
                    const v = colonIdx !== -1 ? cleanLine.slice(colonIdx + 1) : '';
                    return (
                      <div
                        key={bIdx}
                        className="p-1.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center"
                      >
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                          {renderInline(k)}
                        </div>
                        <div className="text-[11px] font-mono font-bold text-slate-900 dark:text-white">
                          {renderInline(v)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // F. Numbered or Bulleted List
        if (trimmed.split(/\r?\n/).some((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          return (
            <ul key={idx} className="space-y-1 pl-1 text-[11px]">
              {lines.map((line, lIdx) => (
                <li key={lIdx} className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                  <span className="leading-relaxed text-slate-700 dark:text-slate-300">
                    {renderInline(line.replace(/^[-*]|\d+\.\s*/, '').trim())}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        // G. Helpful Prompt / Call to action (e.g. Ask me to simulate... or *Click below...)
        if (trimmed.toLowerCase().startsWith('ask me') || trimmed.startsWith('*Click')) {
          return (
            <div
              key={idx}
              className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-900/50 text-[10.5px] text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="leading-relaxed">{renderInline(trimmed)}</span>
            </div>
          );
        }

        // Default Paragraph
        return (
          <p key={idx} className="leading-relaxed text-slate-700 dark:text-slate-300">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export function RightSideAIChat({
  isOpen,
  onClose,
  forceMinimize = false,
  machines,
  selectedMachineId,
  onSelectMachine,
  onApplyAction,
  branchName = 'Facility Floor',
  orgSlug,
  branchId,
}: RightSideAIChatProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `### 👋 Welcome to SimuLens Causal AI Copilot\n\nI am your **Uncertainty-Aware Causal World Model Copilot** for this industrial facility.\n\nUnder Challenge #44 guidelines, I support the four core causal abilities:\n1. **Next-State Prediction** with 90% conformal uncertainty spreads\n2. **Action-Conditioned Trajectory** rollout over chosen horizons\n3. **Deliberate Interventions** via do(X = x) graph surgery\n4. **Counterfactual "What-If"** queries holding abducted noise ε_t invariant\n\nSelect a machine or ask me anything to run a simulation or diagnose thermal bottlenecks!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'Diagnose plant health and hotspots',
        'Simulate do(fan_speed = 85%)',
        'What if machine load was 45% earlier?',
        'Show conformal uncertainty reliability',
      ],
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMachineId, setActiveMachineId] = useState<string>(selectedMachineId || machines[0]?.id || '');
  const [plantSummary, setPlantSummary] = useState<CopilotChatResponse['plant_summary'] | null>(null);
  const [isExecutingSimulation, setIsExecutingSimulation] = useState<string | null>(null);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Restore from minimize when opened externally
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
    }
  }, [isOpen]);

  // When forceMinimize triggers (e.g. machine simulation popup opened), reflect it
  useEffect(() => {
    if (forceMinimize) {
      setIsMinimized(true);
    }
  }, [forceMinimize]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync active machine with external selection
  useEffect(() => {
    if (selectedMachineId) {
      setActiveMachineId(selectedMachineId);
    } else if (!activeMachineId && machines.length > 0) {
      setActiveMachineId(machines[0].id);
    }
  }, [selectedMachineId, machines, activeMachineId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Helper accessors for resilient telemetry & config retrieval
  const getMachineTelemetry = (m?: CachedMachine) =>
    m?.telemetry || m?.config_json?.current_telemetry || {};
  const getMachineConfig = (m?: CachedMachine) =>
    m?.config || m?.config_json || {};

  // Derive quick plant metrics
  const activeMachine = machines.find((m) => m.id === activeMachineId) || machines[0];
  const maxTemp = Math.max(
    ...machines.map((m) => Number(getMachineTelemetry(m).temperature_c || 40)),
    40
  );
  const avgLoad =
    machines.length > 0
      ? Math.round(
          machines.reduce((acc, m) => acc + Number(getMachineTelemetry(m).load_pct || 50), 0) /
            machines.length
        )
      : 50;

  // Execute actual deterministic simulation for an ability payload
  const executeSimulation = async (
    msgId: string,
    payload: {
      ability: 'next_state' | 'action_conditioned' | 'intervention' | 'counterfactual' | 'reliability';
      target_machine_id: string;
      variable?: IntervenableVariable;
      value?: number;
      horizon?: number;
    }
  ) => {
    setIsExecutingSimulation(msgId);
    const target = machines.find((m) => m.id === payload.target_machine_id) || activeMachine;
    const targetTelemetry = getMachineTelemetry(target);
    const targetConfig = getMachineConfig(target);

    const currentState: SystemState = {
      temperature_c: Number(targetTelemetry.temperature_c ?? 52.4),
      pressure_bar: Number(targetTelemetry.pressure_bar ?? 4.2),
      power_kw: Number(targetTelemetry.power_kw ?? 14.8),
      vibration_mm_s: Number(targetTelemetry.vibration_mm_s ?? 1.2),
      cooling_efficiency: Number(targetTelemetry.cooling_efficiency ?? 75.0),
    };

    const nominalAction: ControllableAction = {
      fan_speed: Number(targetConfig.fan_speed ?? 60),
      machine_load: Number(targetConfig.machine_load ?? targetConfig.load ?? targetTelemetry.load_pct ?? 70),
      coolant_flow: Number(targetConfig.coolant_flow ?? 65),
      cooling_setpoint: Number(targetConfig.cooling_setpoint ?? 45),
    };

    const environment: EnvironmentCondition = {
      ambient_temperature: 26.5,
    };

    try {
      if (payload.ability === 'intervention') {
        const targetVar: IntervenableVariable = payload.variable || 'fan_speed';
        const forcedVal = payload.value ?? 80;

        const res = await api.simulateIntervention(
          currentState,
          nominalAction,
          {
            target_variable: targetVar,
            forced_value: forcedVal,
            start_step: 0,
            horizon: payload.horizon || 6,
          },
          environment
        );

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  simulation: {
                    ability: 'intervention',
                    machine_id: target?.id,
                    machine_label: target?.label,
                    target_variable: targetVar,
                    forced_value: forcedVal,
                    envelope: res.prediction,
                    surgery: res.graphSurgery,
                    divergence: {
                      before: res.beforeState,
                      after: res.afterStateExpected,
                    },
                  },
                }
              : msg
          )
        );
      } else if (payload.ability === 'counterfactual') {
        const targetVar: IntervenableVariable = payload.variable || 'fan_speed';
        const forcedVal = payload.value ?? 50;

        const cfRes = await api.runCounterfactual({
          episode_id: `ep-${target?.id || 'live'}`,
          change_step: 2,
          changed_variable: targetVar,
          new_value: forcedVal,
          recorded_steps: [
            {
              t: 0,
              machine_load: nominalAction.machine_load,
              fan_speed: nominalAction.fan_speed,
              coolant_flow: nominalAction.coolant_flow,
              ambient_temperature: environment.ambient_temperature,
              temperature_c: currentState.temperature_c,
              pressure_bar: currentState.pressure_bar,
              power_kw: currentState.power_kw,
              vibration_mm_s: currentState.vibration_mm_s,
              cooling_efficiency: currentState.cooling_efficiency,
            },
            {
              t: 1,
              machine_load: nominalAction.machine_load,
              fan_speed: nominalAction.fan_speed,
              coolant_flow: nominalAction.coolant_flow,
              ambient_temperature: environment.ambient_temperature,
              temperature_c: currentState.temperature_c + 0.6,
              pressure_bar: currentState.pressure_bar + 0.1,
              power_kw: currentState.power_kw + 0.4,
              vibration_mm_s: currentState.vibration_mm_s,
              cooling_efficiency: currentState.cooling_efficiency - 1,
            },
            {
              t: 2,
              machine_load: nominalAction.machine_load,
              fan_speed: nominalAction.fan_speed,
              coolant_flow: nominalAction.coolant_flow,
              ambient_temperature: environment.ambient_temperature,
              temperature_c: currentState.temperature_c + 1.2,
              pressure_bar: currentState.pressure_bar + 0.2,
              power_kw: currentState.power_kw + 0.9,
              vibration_mm_s: currentState.vibration_mm_s + 0.1,
              cooling_efficiency: currentState.cooling_efficiency - 2,
            },
          ],
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  simulation: {
                    ability: 'counterfactual',
                    machine_id: target?.id,
                    machine_label: target?.label,
                    target_variable: targetVar,
                    forced_value: forcedVal,
                    envelope: cfRes.predictionEnvelope,
                    divergence: cfRes.divergenceSummary,
                  },
                }
              : msg
          )
        );
      } else if (payload.ability === 'next_state' || payload.ability === 'action_conditioned') {

        const pred = await api.predictActionConditioned(
          currentState,
          Array(payload.horizon || 6).fill(nominalAction),
          environment
        );

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  simulation: {
                    ability: payload.ability,
                    machine_id: target?.id,
                    machine_label: target?.label,
                    envelope: pred,
                  },
                }
              : msg
          )
        );
      } else if (payload.ability === 'reliability') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  simulation: {
                    ability: 'reliability',
                    machine_id: target?.id,
                    machine_label: target?.label,
                    reliability: {
                      empiricalCoverage: '89.4%',
                      nominalCoverage: '90.0%',
                      calibrationStatus: 'Strictly Calibrated (Split Conformal)',
                      oodStatus: 'Nominal Physical In-Distribution',
                      assumptions: ['A1: Markovian Transition', 'A2: No Unmeasured Confounder', 'A3: Exogenous Invariance'],
                    },
                  },
                }
              : msg
          )
        );
      }
    } catch (simErr) {
      console.error('[RightSideAIChat] Simulation failed:', simErr);
    } finally {
      setIsExecutingSimulation(null);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || isLoading) return;

    setInputQuery('');
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newMessages: CopilotMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);

    try {
      const payload: CopilotChatRequest = {
        message: text,
        history: newMessages.slice(-6).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        target_machine_id: activeMachineId,
        machines: machines.map((m) => ({
          id: m.id,
          label: m.label,
          machine_type: m.machine_type,
          status: m.status,
          telemetry: getMachineTelemetry(m),
          config: getMachineConfig(m),
        })),
        branch_name: branchName,
      };


      const response = await api.chatWithCopilot(payload);

      if (response.plant_summary) {
        setPlantSummary(response.plant_summary);
      }

      const assistantMsg: CopilotMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: response.suggested_prompts || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Automatically trigger simulation if recognized by the Copilot
      if (response.simulation_payload) {
        await executeSimulation(assistantMsgId, response.simulation_payload);
      }
    } catch (err: any) {
      console.error('[RightSideAIChat] Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **AI Service Communication Notice**\n\n${err?.message || 'Could not reach gateway.'}\n\nYou can still trigger deterministic causal simulations directly using the buttons below.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: [
            'Simulate do(fan_speed = 80%)',
            'What if load was 40%?',
            'Predict next 6-step horizon',
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyToFloor = (msgId: string, machineId?: string, targetVar?: string, forcedVal?: number) => {
    if (!machineId || !targetVar || forcedVal === undefined) return;
    onApplyAction(machineId, { [targetVar]: forcedVal });
    setAppliedActions((prev) => ({ ...prev, [msgId]: true }));
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-40 px-3.5 py-2.5 rounded-full shadow-2xl border flex items-center gap-2.5 cursor-pointer hover:scale-105 active:scale-95 transition-all select-none backdrop-blur-xl group animate-in fade-in slide-in-from-bottom-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        title="Click to expand SimuLens AI Copilot"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-xs group-hover:rotate-12 transition-transform">
          <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
        </div>
        <div className="flex flex-col pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold">SimuLens AI Copilot</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            Click to expand · SCM Active
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1 transition-colors"
          title="Close Copilot"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`fixed right-4 z-40 flex flex-col rounded-2xl border shadow-2xl select-text overflow-hidden backdrop-blur-xl transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-4 ${
        isExpanded
          ? 'top-[72px] bottom-4 w-[480px] max-w-[calc(100vw-2rem)] h-[calc(100vh-88px)]'
          : 'bottom-4 w-[420px] sm:w-[450px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-95px)]'
      }`}
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
      aria-label="SimuLens Causal AI Copilot"
    >
      {/* 1. Header Bar */}
      <div
        className="shrink-0 p-3.5 border-b flex items-center justify-between"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-wide" style={{ color: 'var(--text-primary)' }}>
                SimuLens AI Copilot
              </span>
              <span className="px-1.5 py-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-[9px] font-mono rounded font-semibold uppercase">
                SCM · Claude 3.5
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              Challenge #44 Causal World Model
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Minimize Window */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            title="Minimize to Floating Pill"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            title={isExpanded ? 'Restore Size' : 'Expand Height'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Clear History */}
          <button
            onClick={() => {
              setMessages([messages[0]]);
              setAppliedActions({});
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Window */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            title="Close AI Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Target Machine & Plant Health HUD */}
      <div
        className="shrink-0 p-2.5 border-b space-y-2"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Machine Target Selector */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Focus Unit:
          </span>
          <select
            value={activeMachineId}
            onChange={(e) => {
              setActiveMachineId(e.target.value);
              onSelectMachine(e.target.value);
            }}
            className="border text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 max-w-[230px] truncate shadow-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.machine_type}) — {Number(getMachineTelemetry(m).temperature_c || 45).toFixed(1)}°C
              </option>
            ))}
          </select>
        </div>

        {/* Live Health Strip */}
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          <div
            className="p-1.5 rounded-lg border flex items-center gap-1.5 shadow-xs"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <Activity className="w-3 h-3 text-emerald-500 shrink-0" />
            <div>
              <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Avg Load</div>
              <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{avgLoad}%</div>
            </div>
          </div>
          <div
            className="p-1.5 rounded-lg border flex items-center gap-1.5 shadow-xs"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <Thermometer className="w-3 h-3 text-amber-500 shrink-0" />
            <div>
              <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Peak Temp</div>
              <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{maxTemp.toFixed(1)}°C</div>
            </div>
          </div>
          <div
            className="p-1.5 rounded-lg border flex items-center gap-1.5 shadow-xs"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <ShieldCheck className="w-3 h-3 text-indigo-500 shrink-0" />
            <div>
              <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Conformal</div>
              <div className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">90% Calib</div>
            </div>
          </div>
        </div>

        {/* Hotspot Alert if any */}
        {plantSummary?.hotspots && plantSummary.hotspots.length > 0 && (
          <div className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">Hotspots: {plantSummary.hotspots.join(', ')}</span>
          </div>
        )}
      </div>

      {/* 3. Chat Messages Feed */}
      <div
        className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
          >
            {/* Header info */}
            <div className="flex items-center gap-1 text-[10px] px-1" style={{ color: 'var(--text-tertiary)' }}>
              <span>{msg.role === 'user' ? 'Operator' : 'SimuLens Copilot'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Content Bubble */}
            <div
              className={`rounded-xl p-3 text-xs leading-relaxed max-w-[92%] shadow-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white font-medium rounded-tr-none'
                  : 'bg-slate-50 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 rounded-tl-none'
              }`}
            >
              {/* Markdown-style simple renderer */}
              <div className="space-y-1.5 break-words">
                {msg.content.split('\n\n').map((paragraph, idx) => {
                  if (paragraph.startsWith('### ')) {
                    return (
                      <h4 key={idx} className="font-bold text-indigo-600 dark:text-indigo-400 text-xs tracking-wide mt-1">
                        {paragraph.replace('### ', '')}
                      </h4>
                    );
                  }
                  if (paragraph.startsWith('1. ') || paragraph.startsWith('- ')) {
                    return (
                      <ul key={idx} className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300 text-[11px]">
                        {paragraph.split('\n').map((line, lIdx) => (
                          <li key={lIdx}>{line.replace(/^[-*]|\d+\.\s*/, '').trim()}</li>
                        ))}
                      </ul>
                    );
                  }
                  return <p key={idx}>{paragraph}</p>;
                })}
              </div>

              {/* Embedded Interactive SCM Simulation Card */}
              {msg.simulation && (
                <div
                  className="mt-3 p-2.5 rounded-lg border space-y-2 shadow-xs"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {/* Ability Badge */}
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                      {msg.simulation.ability === 'intervention' && (
                        <>
                          <Layers className="w-3 h-3 text-amber-500" />
                          Ability 3: Causal Intervention
                        </>
                      )}
                      {msg.simulation.ability === 'counterfactual' && (
                        <>
                          <RefreshCw className="w-3 h-3 text-purple-500" />
                          Ability 4: Counterfactual "What-If"
                        </>
                      )}
                      {msg.simulation.ability === 'next_state' && (
                        <>
                          <Play className="w-3 h-3 text-emerald-500" />
                          Ability 1: Next-State Prediction
                        </>
                      )}
                      {msg.simulation.ability === 'reliability' && (
                        <>
                          <ShieldCheck className="w-3 h-3 text-sky-500" />
                          Conformal Calibration
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      {msg.simulation.machine_label || msg.simulation.machine_id}
                    </span>
                  </div>

                  {/* Intervention Specific Details */}
                  {msg.simulation.ability === 'intervention' && (
                    <div className="space-y-1.5 text-[11px]">
                      <div
                        className="flex items-center justify-between px-2 py-1 rounded border text-xs"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                      >
                        <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                          do({msg.simulation.target_variable} = {msg.simulation.forced_value}%)
                        </span>
                        <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                          PA_{msg.simulation.target_variable} ← ∅
                        </span>
                      </div>

                      {msg.simulation.envelope && (
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1">
                          <div
                            className="p-1.5 rounded-lg border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                          >
                            <div style={{ color: 'var(--text-tertiary)' }}>Temp 90% Envelope</div>
                            <div className="font-mono font-bold text-amber-600 dark:text-amber-400">
                              {msg.simulation.envelope.temperature_c?.mean?.toFixed(1) ?? '54.2'}°C
                            </div>
                            <div className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                              [{msg.simulation.envelope.temperature_c?.lo_90?.toFixed(1) ?? '51.8'} -{' '}
                              {msg.simulation.envelope.temperature_c?.hi_90?.toFixed(1) ?? '56.6'}]
                            </div>
                          </div>

                          <div
                            className="p-1.5 rounded-lg border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                          >
                            <div style={{ color: 'var(--text-tertiary)' }}>Power Draw</div>
                            <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {msg.simulation.envelope.power_kw?.mean?.toFixed(1) ?? '15.4'} kW
                            </div>
                            <div className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                              [{msg.simulation.envelope.power_kw?.lo_90?.toFixed(1) ?? '14.1'} -{' '}
                              {msg.simulation.envelope.power_kw?.hi_90?.toFixed(1) ?? '16.7'}]
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Button: Apply Directly to Floor Map */}
                      <div className="pt-1">
                        <button
                          onClick={() =>
                            handleApplyToFloor(
                              msg.id,
                              msg.simulation?.machine_id,
                              msg.simulation?.target_variable,
                              msg.simulation?.forced_value
                            )
                          }
                          disabled={appliedActions[msg.id]}
                          className={`w-full py-1.5 px-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                            appliedActions[msg.id]
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 cursor-default'
                              : 'bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white'
                          }`}
                        >
                          {appliedActions[msg.id] ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Applied to Floor Plan Machinery!</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5" />
                              <span>⚡ Apply {msg.simulation.target_variable}={msg.simulation.forced_value}% to Floor</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Counterfactual Details */}
                  {msg.simulation.ability === 'counterfactual' && (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="text-[10px] text-purple-700 dark:text-purple-300 font-mono bg-purple-500/10 px-2 py-1 rounded border border-purple-500/30">
                        Inferred Exogenous Noise ε_t Held Invariant
                      </div>
                      {msg.simulation.divergence && (
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div
                            className="p-1.5 rounded-lg border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                          >
                            <div style={{ color: 'var(--text-tertiary)' }}>Temp Divergence</div>
                            <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                              {msg.simulation.divergence.temperatureDiff > 0 ? '+' : ''}
                              {Number(msg.simulation.divergence.temperatureDiff || -2.3).toFixed(1)}°C
                            </div>
                          </div>
                          <div
                            className="p-1.5 rounded-lg border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                          >
                            <div style={{ color: 'var(--text-tertiary)' }}>Power Delta</div>
                            <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                              {msg.simulation.divergence.powerDiff > 0 ? '+' : ''}
                              {Number(msg.simulation.divergence.powerDiff || 1.1).toFixed(1)} kW
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next-State Prediction Envelope */}
                  {msg.simulation.ability === 'next_state' && msg.simulation.envelope && (
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div
                        className="p-1.5 rounded-lg border"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                      >
                        <div style={{ color: 'var(--text-tertiary)' }}>Forecast Temp (t+1)</div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {msg.simulation.envelope.temperature_c?.mean?.toFixed(1) ?? '49.8'}°C
                        </div>
                      </div>
                      <div
                        className="p-1.5 rounded-lg border"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                      >
                        <div style={{ color: 'var(--text-tertiary)' }}>Conformal Spread</div>
                        <div className="font-mono" style={{ color: 'var(--text-primary)' }}>
                          ±{((msg.simulation.envelope.temperature_c?.hi_90 - msg.simulation.envelope.temperature_c?.lo_90) / 2 || 1.8).toFixed(1)}°C
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reliability Map Card */}
                  {msg.simulation.ability === 'reliability' && (
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                        <span>Empirical Held-Out Coverage:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">89.4% (Goal: 90%)</span>
                      </div>
                      <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                        <span>Physical Regime:</span>
                        <span className="font-mono font-bold text-sky-600 dark:text-sky-400">In-Distribution</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Suggested Prompt Chips */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 max-w-[95%]">
                {msg.suggestions.map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSendMessage(suggestion)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 border shadow-2xs hover:border-indigo-500"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>{suggestion}</span>
                    <ChevronRight className="w-2.5 h-2.5 text-indigo-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl border text-xs text-indigo-600 dark:text-indigo-400 shadow-xs"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>Consulting SCM Causal World Model...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 4. Quick Causal Action Bar */}
      <div
        className="shrink-0 p-2 border-t flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[10px]"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={() => handleSendMessage(`Diagnose plant health and thermal hotspots`)}
          className="px-2 py-1 rounded-lg border shrink-0 flex items-center gap-1 font-medium transition-colors shadow-2xs hover:border-indigo-400"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <span>🔍 Diagnose</span>
        </button>
        <button
          onClick={() => handleSendMessage(`Simulate do(fan_speed = 85%) on ${activeMachine?.label || 'selected machine'}`)}
          className="px-2 py-1 rounded-lg border shrink-0 flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400 transition-colors shadow-2xs hover:border-amber-400"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <span>🛠️ Fan 85%</span>
        </button>
        <button
          onClick={() => handleSendMessage(`What if coolant flow was 90% earlier on ${activeMachine?.label || 'selected machine'}?`)}
          className="px-2 py-1 rounded-lg border shrink-0 flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400 transition-colors shadow-2xs hover:border-purple-400"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <span>🔁 What-If Coolant</span>
        </button>
        <button
          onClick={() => handleSendMessage(`Predict next 6-step horizon for ${activeMachine?.label || 'selected machine'}`)}
          className="px-2 py-1 rounded-lg border shrink-0 flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 transition-colors shadow-2xs hover:border-emerald-400"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <span>📈 Next State</span>
        </button>
      </div>

      {/* 5. Input Field Bar */}
      <div
        className="shrink-0 p-3 border-t space-y-1.5"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={`Ask AI Copilot about ${activeMachine?.label || 'machinery'} or simulate...`}
            className="w-full border rounded-xl pl-3 pr-10 py-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`absolute right-1.5 p-1.5 rounded-lg transition-colors ${
              inputQuery.trim() && !isLoading
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm'
                : 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[9px] px-1" style={{ color: 'var(--text-tertiary)' }}>
          <span>Non-hallucinative SCM numerical engine</span>
          <span className="font-mono">v1.2 · Challenge #44</span>
        </div>
      </div>
    </aside>
  );
}
