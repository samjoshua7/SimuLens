'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  BarChart3,
  Sliders,
  Plus,
  ArrowLeft,
  Search,
  Power,
  RotateCw,
  ExternalLink,
  Trash2,
  Crosshair,
  Radio,
  Cpu,
  Thermometer,
  Snowflake,
  Gauge,
  Zap,
  Fan,
  Activity,
  Flame,
  Layers,
} from 'lucide-react';
import { CachedMachine, CachedBranch, CachedOrg } from '@/lib/branchStore';
import { MACHINERY_CATALOG, getPresetForType } from '@/types/machinery';

const ICONS: Record<string, React.ElementType> = {
  Thermometer,
  Snowflake,
  Gauge,
  Zap,
  Fan,
  Activity,
  Flame,
  Layers,
  Sliders,
  Cpu,
};

export type BranchViewMode = 'canvas' | 'telemetry' | 'inventory' | 'activity';

interface BranchSideNavProps {
  org: CachedOrg;
  branch: CachedBranch;
  machines: CachedMachine[];
  selectedId: string | null;
  activeView: BranchViewMode;
  onSelectView: (view: BranchViewMode) => void;
  onSelectMachine: (id: string | null) => void;
  onFocusMachine: (id: string) => void;
  onQuickStatusChange: (id: string, newStatus: CachedMachine['status']) => void;
  onRotateMachine: (id: string) => void;
  onDeleteMachine: (id: string) => void;
  onOpenCustomModal: () => void;
  onQuickAddPreset: (type: string) => void;
  onStartPlacingPreset?: (type: string) => void;
  onUpdateMachinePosition?: (id: string, x: number, y: number) => void;
  onOpenSimulationPopup?: (id: string) => void;
}

export function BranchSideNav({
  org,
  branch,
  machines,
  selectedId,
  activeView,
  onSelectView,
  onSelectMachine,
  onFocusMachine,
  onQuickStatusChange,
  onRotateMachine,
  onDeleteMachine,
  onOpenCustomModal,
  onQuickAddPreset,
  onStartPlacingPreset,
  onUpdateMachinePosition,
  onOpenSimulationPopup,
}: BranchSideNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const selectedMachine = machines.find((m) => m.id === selectedId) || null;

  // Filter machines for inventory tab
  const filteredMachines = machines.filter((m) => {
    const matchesSearch = m.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <aside
      className={`relative z-30 flex flex-col border-r transition-all duration-300 select-none shadow-md shrink-0 ${
        collapsed ? 'w-16' : 'w-80'
      }`}
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Top Header */}
      <div className="p-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        {!collapsed ? (
          <div className="min-w-0 pr-2">
            <Link
              href={`/dashboard/${org.slug}`}
              className="inline-flex items-center gap-1 text-[11px] mb-1 font-medium transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ArrowLeft className="w-3 h-3" />
              <span>{org.name}</span>
            </Link>
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {branch.name}
            </h2>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {branch.address || 'Facility Floor Plan'}
            </p>
          </div>
        ) : (
          <div className="mx-auto">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600 font-bold text-xs">
              {branch.name.slice(0, 2).toUpperCase()}
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Main View Switcher Navigation */}
      <div className="p-2 border-b space-y-1" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'canvas', label: 'Floor Plan Map', icon: LayoutGrid },
          { key: 'telemetry', label: 'Office Telemetry HUD', icon: BarChart3 },
          { key: 'inventory', label: `Machinery (${machines.length})`, icon: Cpu },
          { key: 'activity', label: 'Live Telemetry Log', icon: Radio },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectView(item.key as BranchViewMode)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
              }`}
              title={item.label}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Body: Depending on activeView or collapsed state */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!collapsed ? (
          <>
            {/* Quick Equipment Palette */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Equipment Palette
                </span>
                <button
                  onClick={onOpenCustomModal}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus className="w-3 h-3" />
                  <span>Custom</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400 mb-2">
                Drag card directly to desired position on map, or click to target.
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {MACHINERY_CATALOG.slice(0, 6).map((preset) => {
                  const IconComp = ICONS[preset.iconName] || Sliders;
                  return (
                    <div
                      key={preset.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', preset.type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => {
                        if (onStartPlacingPreset) {
                          onStartPlacingPreset(preset.type);
                        } else {
                          onQuickAddPreset(preset.type);
                        }
                      }}
                      className="p-2 rounded-xl border text-left hover:border-indigo-400 hover:shadow-sm transition-all flex items-center gap-2 group cursor-grab active:cursor-grabbing select-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border)',
                      }}
                      title={`Drag ${preset.label} to map or click to place`}
                    >
                      <div
                        className="p-1 rounded-md shrink-0"
                        style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {preset.label.split(' ')[0]}
                        </p>
                        <p className="text-[9px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {preset.specs.rated_power_kw} kW
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onOpenCustomModal}
                className="w-full mt-2 py-1.5 px-2 rounded-xl border border-dashed text-xs font-medium text-center flex items-center justify-center gap-1.5 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>+ Build Custom Equipment</span>
              </button>
            </div>

            {/* Selected Machine Quick Inspector */}
            {selectedMachine && (
              <div
                className="rounded-xl border p-3 shadow-sm animate-fade-in"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-500">
                      Selected Machinery
                    </span>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {selectedMachine.label}
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectMachine(null)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                </div>

                {/* Precision Positioning Coordinates */}
                <div className="mb-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                    Desired Position (Pixels)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 mt-1 font-mono text-xs">
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-slate-400 text-[10px]">X:</span>
                      <input
                        type="number"
                        value={selectedMachine.x}
                        onChange={(e) => {
                          const val = Math.max(10, parseInt(e.target.value) || 0);
                          onUpdateMachinePosition?.(selectedMachine.id, val, selectedMachine.y);
                        }}
                        className="w-full bg-transparent border-0 outline-none text-xs font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      />
                      <span className="text-slate-400 text-[9px]">px</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-slate-400 text-[10px]">Y:</span>
                      <input
                        type="number"
                        value={selectedMachine.y}
                        onChange={(e) => {
                          const val = Math.max(10, parseInt(e.target.value) || 0);
                          onUpdateMachinePosition?.(selectedMachine.id, selectedMachine.x, val);
                        }}
                        className="w-full bg-transparent border-0 outline-none text-xs font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      />
                      <span className="text-slate-400 text-[9px]">px</span>
                    </div>
                  </div>
                </div>

                {/* Live values */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3 font-mono">
                  <div className="p-1.5 rounded bg-white dark:bg-slate-900 border" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Temperature</span>
                    <p className="font-semibold text-xs mt-0.5">
                      {(selectedMachine.config_json?.current_telemetry?.temperature_c ?? 65.0).toFixed(1)}°C
                    </p>
                  </div>
                  <div className="p-1.5 rounded bg-white dark:bg-slate-900 border" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Power Draw</span>
                    <p className="font-semibold text-xs mt-0.5">
                      {(selectedMachine.config_json?.current_telemetry?.power_kw ?? 18.5).toFixed(1)} kW
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-1.5">
                  {onOpenSimulationPopup && (
                    <button
                      onClick={() => onOpenSimulationPopup(selectedMachine.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: 'var(--accent)' }}
                      title="Open In-Place Simulation & Resource Controls right on the map"
                    >
                      <span>⚡ Open In-Place Simulator</span>
                    </button>
                  )}

                  <Link
                    href={`/dashboard/${org.slug}/${branch.id}/${selectedMachine.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium border text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                    title="Launch full Causal Simulation & Intervention engine in new window (PC2 multi-screen)"
                  >
                    <span>Dedicated Simulator Tab</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <div className="flex items-center gap-1 pt-1">
                    <button
                      onClick={() => onFocusMachine(selectedMachine.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg border text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      title="Center and focus canvas on this machine"
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>Focus</span>
                    </button>

                    <button
                      onClick={() => onRotateMachine(selectedMachine.id)}
                      className="p-1.5 rounded-lg border text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      title="Rotate 90 degrees"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteMachine(selectedMachine.id)}
                      className="p-1.5 rounded-lg border text-xs hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 transition-colors"
                      style={{ borderColor: 'var(--border)' }}
                      title="Delete Machine"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Machinery Quick List */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Placed Equipment ({machines.length})
                </span>
              </div>

              <div className="space-y-1">
                {machines.map((m) => {
                  const preset = getPresetForType(m.machine_type);
                  const IconComp = ICONS[preset.iconName] || Sliders;
                  const isSelected = selectedId === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelectMachine(m.id)}
                      className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                      style={{
                        backgroundColor: isSelected ? undefined : 'var(--bg-primary)',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="p-1 rounded-md shrink-0"
                          style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {m.label}
                          </p>
                          <p className="text-[10px] capitalize" style={{ color: 'var(--text-tertiary)' }}>
                            {m.status} • {preset.label.split(' ')[0]}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocusMachine(m.id);
                          }}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600"
                          title="Focus machine on canvas"
                        >
                          <Crosshair className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Collapsed Mini Rail */
          <div className="space-y-3 flex flex-col items-center">
            {MACHINERY_CATALOG.slice(0, 5).map((preset) => {
              const IconComp = ICONS[preset.iconName] || Sliders;
              return (
                <button
                  key={preset.type}
                  onClick={() => onQuickAddPreset(preset.type)}
                  className="p-2 rounded-xl border hover:scale-110 transition-transform shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border)',
                    color: preset.color,
                  }}
                  title={`Add ${preset.label}`}
                >
                  <IconComp className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
        {!collapsed ? (
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>Canvas: {branch.canvas_w}×{branch.canvas_h}px</span>
            <span className="font-mono">{machines.length} units</span>
          </div>
        ) : (
          <div className="text-center font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {machines.length}
          </div>
        )}
      </div>
    </aside>
  );
}
