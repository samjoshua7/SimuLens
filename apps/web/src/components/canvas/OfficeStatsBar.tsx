'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Zap,
  Thermometer,
  AlertTriangle,
  Radio,
  Save,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  ExternalLink,
  Layers,
  Fuel,
  RefreshCw,
  LayoutGrid,
  Power,
  Sparkles,
} from 'lucide-react';

import { CachedMachine, ResourcePoolsState, DEFAULT_RESOURCE_POOLS } from '@/lib/branchStore';
import { getPresetForType } from '@/types/machinery';
import { ResourceType } from './ResourceGridOverlay';

interface VisibleCardsState {
  power: boolean;
  diesel: boolean;
  petrol: boolean;
  hydrogen: boolean;
  kerosene: boolean;
  thermal: boolean;
}

interface OfficeStatsBarProps {
  orgSlug: string;
  branchId: string;
  machines: CachedMachine[];
  zoom: number;
  hasUnsaved: boolean;
  saving: boolean;
  isRealtimeConnected: boolean;
  showPipes: boolean;
  activeResourceFilter: ResourceType;
  isAutoSimulating?: boolean;
  resourcePools?: ResourcePoolsState;
  isAiChatOpen?: boolean;
  onToggleAiChat?: () => void;
  onToggleAutoSimulating?: () => void;
  onToggleGridPower?: () => void;
  onRefillPools?: () => void;
  onAutoArrangeLayout?: () => void;
  onTogglePipes: () => void;
  onSelectResourceFilter: (res: ResourceType) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSave: () => void;
  onOpenAddModal: () => void;
}


export function OfficeStatsBar({
  orgSlug,
  branchId,
  machines,
  zoom,
  hasUnsaved,
  saving,
  isRealtimeConnected,
  showPipes,
  activeResourceFilter,
  isAutoSimulating = false,
  resourcePools = DEFAULT_RESOURCE_POOLS,
  isAiChatOpen = false,
  onToggleAiChat,
  onToggleAutoSimulating,

  onToggleGridPower,
  onRefillPools,
  onAutoArrangeLayout,
  onTogglePipes,
  onSelectResourceFilter,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSave,
  onOpenAddModal,
}: OfficeStatsBarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCardCustomizer, setShowCardCustomizer] = useState(false);
  const [visibleCards, setVisibleCards] = useState<VisibleCardsState>({
    power: true,
    diesel: true,
    petrol: true,
    hydrogen: true,
    kerosene: true,
    thermal: true,
  });

  const totalMachines = machines.length;
  const runningMachines = machines.filter((m) => m.status === 'running').length;
  const warningMachines = machines.filter((m) => m.status === 'warning' || m.status === 'critical').length;

  const totalPower = machines.reduce((acc, m) => {
    if (m.status === 'idle' || m.status === 'offline') return acc;
    const p = m.config_json?.current_telemetry?.power_kw ?? getPresetForType(m.machine_type).specs.rated_power_kw;
    return acc + Number(p || 0);
  }, 0);

  const totalDiesel = machines
    .filter((m) => m.status !== 'offline' && (m.config_json?.primary_resource === 'diesel' || m.machine_type === 'boiler'))
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 14.5), 0);

  const totalPetrol = machines
    .filter((m) => m.status !== 'offline' && (m.config_json?.primary_resource === 'petrol' || m.machine_type === 'compressor'))
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 9.5), 0);

  const totalHydrogen = machines
    .filter((m) => m.status !== 'offline' && (m.config_json?.primary_resource === 'hydrogen' || m.machine_type === 'chiller'))
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 3.5), 0);

  const totalKerosene = machines
    .filter((m) => m.status !== 'offline' && m.config_json?.primary_resource === 'kerosene')
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 12.0), 0);

  // Mean facility thermal index
  const avgTemp =
    machines.length > 0
      ? machines.reduce((acc, m) => {
          const t = m.config_json?.current_telemetry?.temperature_c ?? getPresetForType(m.machine_type).specs.nominal_temp_c;
          return acc + Number(t || 25);
        }, 0) / machines.length
      : 25.0;

  // Collapsed Minimal Floating Pill
  if (isCollapsed) {
    return (
      <div
        className="w-full px-4 py-2 border-b flex items-center justify-between gap-3 text-xs select-none backdrop-blur-md shadow-sm transition-all"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-700 dark:text-slate-300">
            <span className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>Facility HUD</span>
          </div>

          <div className="flex items-center gap-1 font-mono text-xs font-bold text-amber-500">
            <Zap className="w-3.5 h-3.5" />
            <span>{totalPower.toFixed(1)} kW</span>
          </div>

          <div className="flex items-center gap-1 font-mono text-xs font-bold text-rose-500">
            <Thermometer className="w-3.5 h-3.5" />
            <span>{avgTemp.toFixed(1)}°C</span>
          </div>

          {/* Quick Outage Status */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            resourcePools.grid_online ? 'bg-sky-500/10 text-sky-500' : 'bg-rose-500 text-white animate-pulse'
          }`}>
            {resourcePools.grid_online ? '⚡ 415V' : '⚠️ OUTAGE'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onToggleAutoSimulating && (
            <button
              onClick={onToggleAutoSimulating}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                isAutoSimulating
                  ? 'bg-emerald-500 text-white animate-pulse shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800'
              }`}
              title="Toggle Live Continuous Simulation Physics Loop"
            >
              <span>{isAutoSimulating ? '⏸ Pause' : '▶ Live Sim'}</span>
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:opacity-80 transition-opacity"
            title="Expand Full Office HUD"
          >
            <span>▾ Expand HUD</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full px-3 py-1.5 border-b flex items-center justify-between gap-2 overflow-x-auto scrollbar-none select-none transition-all shadow-xs z-30 shrink-0"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Left: Overall Office-System Statistics & Resource Pools Cards */}
      <div className="flex items-center gap-1.5 text-xs shrink-0 flex-nowrap">
        {/* Realtime link status */}
        <div className="flex items-center gap-1.5 pl-1 pr-2">
          <div className="relative flex items-center justify-center">
            <span className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isRealtimeConnected && (
              <span className="absolute w-3.5 h-3.5 rounded-full bg-emerald-500/40 animate-ping" />
            )}
          </div>
          <div>
            <p className="font-semibold text-xs leading-none" style={{ color: 'var(--text-primary)' }}>
              Factory Grid HUD
            </p>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              {isRealtimeConnected ? 'PC1 ↔ PC2 Active' : 'Connecting...'}
            </p>
          </div>
        </div>

        <div className="h-6 w-px" style={{ backgroundColor: 'var(--border)' }} />

        {/* ⚡ Grid Power Switch & ATS Failover Button */}
        {onToggleGridPower && (
          <button
            onClick={onToggleGridPower}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold transition-all shadow-sm ${
              resourcePools.grid_online
                ? 'bg-sky-500/10 border-sky-400 text-sky-600 dark:text-sky-400 hover:bg-rose-500/10 hover:border-rose-400 hover:text-rose-500'
                : 'bg-rose-500 border-rose-600 text-white animate-pulse'
            }`}
            title={resourcePools.grid_online ? 'Grid is Online. Click to simulate Power Outage (triggers Genset ATS)' : 'Grid Outage Active! Genset Running. Click to restore grid.'}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{resourcePools.grid_online ? 'Grid: 415V ON' : '⚠️ OUTAGE (ATS GENSET)'}</span>
          </button>
        )}

        {/* Total Power Draw Card */}
        {visibleCards.power && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-amber-500/10 shadow-sm border border-amber-500/20">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Load</span>
              <p className="font-mono font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                {totalPower.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">kW</span>
              </p>
            </div>
          </div>
        )}

        {/* Diesel Tank & Burn Rate Card */}
        {visibleCards.diesel && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-orange-500/10 shadow-sm border border-orange-500/20">
            <span className="text-xs text-orange-500">⛽</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold">Diesel Tank</span>
                <span className="text-[9px] font-mono font-bold text-orange-600">
                  {resourcePools.diesel_current_l.toFixed(0)}L
                </span>
              </div>
              <p className="font-mono font-bold text-xs text-orange-600 dark:text-orange-400">
                {totalDiesel.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Petrol Tank Card */}
        {visibleCards.petrol && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-yellow-500/10 shadow-sm border border-yellow-500/20">
            <span className="text-xs text-yellow-600">⛽</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider text-yellow-600 dark:text-yellow-400 font-semibold">Petrol</span>
                <span className="text-[9px] font-mono font-bold text-yellow-600">
                  {resourcePools.petrol_current_l.toFixed(0)}L
                </span>
              </div>
              <p className="font-mono font-bold text-xs text-yellow-600 dark:text-yellow-400">
                {totalPetrol.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Hydrogen Tank Card */}
        {visibleCards.hydrogen && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-500/10 shadow-sm border border-emerald-500/20">
            <span className="text-xs text-emerald-500 font-bold">🧪</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">H₂ Tank</span>
                <span className="text-[9px] font-mono font-bold text-emerald-600">
                  {resourcePools.hydrogen_current_kg.toFixed(0)}kg
                </span>
              </div>
              <p className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                {totalHydrogen.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">kg/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Kerosene Tank Card */}
        {visibleCards.kerosene && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-purple-500/10 shadow-sm border border-purple-500/20">
            <span className="text-xs text-purple-500">🛢️</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Kerosene</span>
                <span className="text-[9px] font-mono font-bold text-purple-600">
                  {resourcePools.kerosene_current_l.toFixed(0)}L
                </span>
              </div>
              <p className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400">
                {totalKerosene.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Average Thermal Index Card */}
        {visibleCards.thermal && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-500/10 shadow-sm border border-rose-500/20">
            <Thermometer className="w-3.5 h-3.5 text-rose-500" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold">Avg Temp</span>
              <p className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
                {avgTemp.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">°C</span>
              </p>
            </div>
          </div>
        )}

        {/* ⛽ Refill Tanks Action Button */}
        {onRefillPools && (
          <button
            onClick={onRefillPools}
            className="flex items-center gap-1 px-2 py-1 rounded-xl border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-orange-500 hover:border-orange-400 text-xs font-semibold transition-all shadow-sm"
            title="Refill all depleted resource tanks to 100% capacity"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refill Pools</span>
          </button>
        )}
      </div>

      {/* Right: Map Controls, Filters & Navigation */}
      <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
        {/* Auto-Arrange Floor Plan Button */}
        {onAutoArrangeLayout && (
          <button
            onClick={onAutoArrangeLayout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold transition-all shadow-xs"
            title="Auto-arrange machines in clean bays below resource stations"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
            <span>Auto-Arrange</span>
          </button>
        )}

        {/* Pipeline Conduits Toggle */}
        <button
          onClick={onTogglePipes}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            showPipes ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-600 dark:text-sky-400' : 'opacity-60 hover:opacity-100'
          }`}
          style={{ borderColor: showPipes ? undefined : 'var(--border)' }}
          title="Toggle Animated Supply Lines"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{showPipes ? 'Pipes: ON' : 'Pipes: OFF'}</span>
        </button>

        {/* Resource Filter Dropdown */}
        {showPipes && (
          <select
            value={activeResourceFilter}
            onChange={(e) => onSelectResourceFilter(e.target.value as ResourceType)}
            className="px-2 py-1 rounded-lg border text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Lines</option>
            <option value="electricity">⚡ Electric Grid</option>
            <option value="diesel">⛽ Diesel</option>
            <option value="petrol">⛽ Petrol</option>
            <option value="hydrogen">🧪 Hydrogen</option>
            <option value="kerosene">🛢️ Kerosene</option>
          </select>
        )}

        {/* Live Simulation Loop Toggle */}
        {onToggleAutoSimulating && (
          <button
            onClick={onToggleAutoSimulating}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isAutoSimulating
                ? 'bg-emerald-500 border-emerald-400 text-white animate-pulse shadow-md'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
            style={{ borderColor: isAutoSimulating ? undefined : 'var(--border)' }}
            title="Toggle Live Continuous Simulation Physics Loop"
          >
            <span>{isAutoSimulating ? '⏸ Sim Active' : '▶ Live Sim'}</span>
          </button>
        )}

        {/* Link to PC2 Central Simulation Console */}
        <Link
          href={`/dashboard/${orgSlug}/${branchId}/simulation`}
          target="_blank"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:opacity-90 shadow-xs"
          title="Open Central Multi-Machine Console in separate tab/window (PC2 setup)"
        >
          <span>PC2 Console</span>
          <ExternalLink className="w-3 h-3" />
        </Link>

        {/* SimuLens AI Causal Copilot Toggle Button (Challenge #44) */}
        {onToggleAiChat && (
          <button
            onClick={onToggleAiChat}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-xs ${
              isAiChatOpen
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-indigo-400 text-white shadow-indigo-500/25 ring-2 ring-indigo-500/30'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-slate-900 dark:border-indigo-500/40 dark:text-indigo-400 dark:hover:bg-slate-800'
            }`}
            title="Open AI Causal Copilot Chat & Hotspot Diagnostics (Challenge #44)"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAiChatOpen ? 'animate-spin' : 'text-indigo-500 dark:text-indigo-400'}`} />
            <span>AI Copilot</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          </button>
        )}


        {/* Add Machine Button */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Place Machine</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onZoomOut}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-1 text-[11px] font-mono hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Save Layout */}
        <button
          onClick={onSave}
          disabled={saving || !hasUnsaved}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            hasUnsaved
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'opacity-50 cursor-not-allowed'
          }`}
          style={{
            borderColor: hasUnsaved ? 'var(--accent)' : 'var(--border)',
            color: hasUnsaved ? 'var(--accent)' : 'var(--text-tertiary)',
          }}
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : hasUnsaved ? 'Save Layout*' : 'Saved'}</span>
        </button>

        {/* Collapse HUD Button */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600"
          style={{ borderColor: 'var(--border)' }}
          title="Minimize HUD to header line"
        >
          −
        </button>
      </div>
    </div>
  );
}
