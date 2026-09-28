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
} from 'lucide-react';
import { CachedMachine } from '@/lib/branchStore';
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
  onToggleAutoSimulating?: () => void;
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
  onToggleAutoSimulating,
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
    if (m.status === 'idle' || m.status === 'offline') return acc + 1.2;
    const p = m.config_json?.current_telemetry?.power_kw ?? getPresetForType(m.machine_type).specs.rated_power_kw;
    return acc + Number(p || 0);
  }, 0);

  const totalDiesel = machines
    .filter((m) => m.config_json?.primary_resource === 'diesel' || m.machine_type === 'boiler')
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 14.5), 0);

  const totalPetrol = machines
    .filter((m) => m.config_json?.primary_resource === 'petrol' || m.machine_type === 'compressor')
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 10.0), 0);

  const totalHydrogen = machines
    .filter((m) => m.config_json?.primary_resource === 'hydrogen' || m.machine_type === 'chiller')
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 6.5), 0);

  const totalKerosene = machines
    .filter((m) => m.config_json?.primary_resource === 'kerosene')
    .reduce((acc, m) => acc + (m.config_json?.resource_rate || 8.0), 0);

  const avgTemp = totalMachines > 0
    ? machines.reduce((acc, m) => {
        const t = m.config_json?.current_telemetry?.temperature_c ?? getPresetForType(m.machine_type).specs.nominal_temp_c;
        return acc + Number(t || 0);
      }, 0) / totalMachines
    : 0;

  // Compact collapsed summary pill
  if (isCollapsed) {
    return (
      <div
        className="absolute top-4 right-4 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border backdrop-blur-md shadow-xl select-none animate-fade-in"
        style={{
          backgroundColor: 'var(--bg-primary-translucent, rgba(255, 255, 255, 0.94))',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2 pr-1">
          <span className={`w-2.5 h-2.5 rounded-full ${isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>Grid HUD</span>
        </div>

        <div className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />

        <div className="flex items-center gap-1 font-mono text-xs text-amber-600 dark:text-amber-400 font-bold">
          <Zap className="w-3.5 h-3.5" />
          <span>{totalPower.toFixed(1)} kW</span>
        </div>

        <div className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />

        <div className="flex items-center gap-1 font-mono text-xs text-orange-600 dark:text-orange-400 font-bold">
          <span>⛽</span>
          <span>{totalDiesel.toFixed(1)} L/h</span>
        </div>

        <div className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />

        <div className="flex items-center gap-1 font-mono text-xs text-rose-600 dark:text-rose-400 font-bold">
          <Thermometer className="w-3.5 h-3.5" />
          <span>{avgTemp.toFixed(1)}°C</span>
        </div>

        {onToggleAutoSimulating && (
          <>
            <div className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
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
          </>
        )}

        <div className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />

        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:opacity-80 transition-opacity"
          title="Expand Full Office HUD"
        >
          <span>▾ Expand HUD</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-4 left-4 right-4 z-40 rounded-2xl border p-2.5 backdrop-blur-md shadow-lg flex items-center justify-between gap-3 flex-wrap select-none animate-fade-in"
      style={{
        backgroundColor: 'var(--bg-primary-translucent, rgba(255, 255, 255, 0.90))',
        borderColor: 'var(--border)',
      }}
    >
      {/* Left: Overall Office-System Statistics Cards */}
      <div className="flex items-center gap-2.5 text-xs flex-wrap">
        {/* Realtime link status */}
        <div className="flex items-center gap-2 pl-1 pr-2">
          <div className="relative flex items-center justify-center">
            <span className={`w-2.5 h-2.5 rounded-full ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isRealtimeConnected && (
              <span className="absolute w-4 h-4 rounded-full bg-emerald-500/40 animate-ping" />
            )}
          </div>
          <div>
            <p className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
              Office Grid HUD
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {isRealtimeConnected ? 'PC1 ↔ PC2 Active' : 'Connecting...'}
            </p>
          </div>
        </div>

        <div className="h-6 w-px" style={{ backgroundColor: 'var(--border)' }} />

        {/* Total Power Draw Card */}
        {visibleCards.power && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-amber-500/10 shadow-sm border border-amber-500/20">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Power</span>
              <p className="font-mono font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                {totalPower.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">kW</span>
              </p>
            </div>
          </div>
        )}

        {/* Diesel Card */}
        {visibleCards.diesel && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-orange-500/10 shadow-sm border border-orange-500/20">
            <span className="text-xs text-orange-500">⛽</span>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold">Diesel</span>
              <p className="font-mono font-bold text-xs text-orange-600 dark:text-orange-400">
                {totalDiesel.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Petrol Card */}
        {visibleCards.petrol && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-yellow-500/10 shadow-sm border border-yellow-500/20">
            <span className="text-xs text-yellow-600">⛽</span>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-yellow-600 dark:text-yellow-400 font-semibold">Petrol</span>
              <p className="font-mono font-bold text-xs text-yellow-600 dark:text-yellow-400">
                {totalPetrol.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Hydrogen Card */}
        {visibleCards.hydrogen && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-500/10 shadow-sm border border-emerald-500/20">
            <span className="text-xs text-emerald-500 font-bold">🧪</span>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">Hydrogen</span>
              <p className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                {totalHydrogen.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">kg/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Kerosene Card */}
        {visibleCards.kerosene && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-purple-500/10 shadow-sm border border-purple-500/20">
            <span className="text-xs text-purple-500">🛢️</span>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Kerosene</span>
              <p className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400">
                {totalKerosene.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </p>
            </div>
          </div>
        )}

        {/* Mean Temp */}
        {visibleCards.thermal && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-500/10 shadow-sm border border-rose-500/20">
            <Thermometer className="w-3.5 h-3.5 text-rose-500" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold">Thermal</span>
              <p className="font-mono font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                {avgTemp.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">°C</span>
              </p>
            </div>
          </div>
        )}

        {/* Customize Cards Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowCardCustomizer(!showCardCustomizer)}
            className="p-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600"
            style={{ borderColor: 'var(--border)' }}
            title="Customize Visible Cards"
          >
            ⚙️
          </button>

          {showCardCustomizer && (
            <div
              className="absolute left-0 top-full mt-2 w-48 rounded-xl border p-2.5 shadow-xl z-50 animate-fade-in"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Toggle Metric Cards
              </p>
              <div className="space-y-1.5 text-xs">
                {([
                  { key: 'power', label: '⚡ Power Demand' },
                  { key: 'diesel', label: '⛽ Diesel' },
                  { key: 'petrol', label: '⛽ Petrol' },
                  { key: 'hydrogen', label: '🧪 Hydrogen' },
                  { key: 'kerosene', label: '🛢️ Kerosene' },
                  { key: 'thermal', label: '🌡️ Mean Thermal' },
                ] as const).map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                    <input
                      type="checkbox"
                      checked={visibleCards[item.key]}
                      onChange={(e) =>
                        setVisibleCards((prev: VisibleCardsState) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="rounded text-indigo-600"
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spacebar Pan & Zoom UX Helper Badge */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 text-[10px] text-slate-400 font-mono">
          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">[SPACE]</span>
          <span>+ Drag to Pan</span>
          <span className="opacity-40">•</span>
          <span>Pinch to Zoom</span>
        </div>
      </div>

      {/* Right: Pipeline Layer Controls & Quick Actions */}
      <div className="flex items-center gap-2">
        {/* Pipeline Layer Toggle */}
        <button
          onClick={onTogglePipes}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            showPipes ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-600 dark:text-sky-400' : 'opacity-60 hover:opacity-100'
          }`}
          style={{ borderColor: showPipes ? undefined : 'var(--border)' }}
          title="Toggle Animated Supply Lines (Power, Diesel, Petrol, Hydrogen, Kerosene)"
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
            title="Toggle Live Continuous Simulation Physics Loop (steps real ODEs with noise every 1.5s)"
          >
            <span>{isAutoSimulating ? '⏸ Sim Active' : '▶ Live Sim'}</span>
          </button>
        )}

        {/* Link to PC2 Central Simulation Console */}
        <Link
          href={`/dashboard/${orgSlug}/${branchId}/simulation`}
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:opacity-90 shadow-sm"
          title="Open Central Multi-Machine Console in separate tab/window (PC2 setup)"
        >
          <span>PC2 Console</span>
          <ExternalLink className="w-3 h-3" />
        </Link>

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
          title="Minimize HUD to clear floor plan view"
        >
          −
        </button>
      </div>
    </div>
  );
}
