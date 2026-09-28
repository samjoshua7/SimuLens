'use client';

import React from 'react';
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
} from 'lucide-react';
import { CachedMachine } from '@/lib/branchStore';
import { getPresetForType } from '@/types/machinery';

interface OfficeStatsBarProps {
  machines: CachedMachine[];
  zoom: number;
  hasUnsaved: boolean;
  saving: boolean;
  isRealtimeConnected: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSave: () => void;
  onOpenAddModal: () => void;
}

export function OfficeStatsBar({
  machines,
  zoom,
  hasUnsaved,
  saving,
  isRealtimeConnected,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSave,
  onOpenAddModal,
}: OfficeStatsBarProps) {
  // Compute aggregate stats
  const totalMachines = machines.length;
  const runningMachines = machines.filter((m) => m.status === 'running').length;
  const warningMachines = machines.filter((m) => m.status === 'warning' || m.status === 'critical').length;

  const totalPower = machines.reduce((acc, m) => {
    if (m.status === 'idle' || m.status === 'offline') return acc + 1.2;
    const p = m.config_json?.current_telemetry?.power_kw ?? getPresetForType(m.machine_type).specs.rated_power_kw;
    return acc + Number(p || 0);
  }, 0);

  const avgTemp = totalMachines > 0
    ? machines.reduce((acc, m) => {
        const t = m.config_json?.current_telemetry?.temperature_c ?? getPresetForType(m.machine_type).specs.nominal_temp_c;
        return acc + Number(t || 0);
      }, 0) / totalMachines
    : 0;

  return (
    <div
      className="absolute top-4 left-4 right-4 z-40 rounded-2xl border p-2.5 backdrop-blur-md shadow-lg flex items-center justify-between gap-4 flex-wrap select-none"
      style={{
        backgroundColor: 'var(--bg-primary-translucent, rgba(255, 255, 255, 0.88))',
        borderColor: 'var(--border)',
      }}
    >
      {/* Left: Overall Office-System Statistics */}
      <div className="flex items-center gap-4 text-xs">
        {/* Status indicator */}
        <div className="flex items-center gap-2 pl-1">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2.5 h-2.5 rounded-full ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            {isRealtimeConnected && (
              <span className="absolute w-4 h-4 rounded-full bg-emerald-500/40 animate-ping" />
            )}
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Office Telemetry HUD
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {isRealtimeConnected ? 'Live Multi-Screen Sync' : 'Connecting Sync...'}
            </p>
          </div>
        </div>

        <div className="h-6 w-px" style={{ backgroundColor: 'var(--border)' }} />

        {/* Aggregate KPI 1: Active Equipment */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Equipment</span>
            <p className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {runningMachines}/{totalMachines} <span className="text-[10px] font-normal text-slate-400">Online</span>
            </p>
          </div>
        </div>

        {/* Aggregate KPI 2: Total Power */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Total Grid Load</span>
            <p className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {totalPower.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">kW</span>
            </p>
          </div>
        </div>

        {/* Aggregate KPI 3: Mean Facility Temp */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
            <Thermometer className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Mean Thermal Index</span>
            <p className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {avgTemp.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">°C</span>
            </p>
          </div>
        </div>

        {/* Warning Indicator (if any) */}
        {warningMachines > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 font-medium text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{warningMachines} Alarms</span>
          </div>
        )}
      </div>

      {/* Right: Quick Actions & Canvas Toolbelt */}
      <div className="flex items-center gap-2">
        {/* Add Machine Button */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Deploy Machinery</span>
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
      </div>
    </div>
  );
}
