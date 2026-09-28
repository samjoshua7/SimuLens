'use client';

import React, { memo, useState } from 'react';
import Link from 'next/link';
import {
  Thermometer,
  Snowflake,
  Gauge,
  Zap,
  Fan,
  Activity,
  Flame,
  Layers,
  Sliders,
  ExternalLink,
  AlertTriangle,
  RotateCw,
  Power,
} from 'lucide-react';
import { CachedMachine } from '@/lib/branchStore';
import { getPresetForType } from '@/types/machinery';

const ICON_MAP: Record<string, React.ElementType> = {
  Thermometer,
  Snowflake,
  Gauge,
  Zap,
  Fan,
  Activity,
  Flame,
  Layers,
  Sliders,
};

const STATUS_CONFIG = {
  running: { label: 'Running', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)' },
  warning: { label: 'Warning', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' },
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)' },
  idle: { label: 'Idle', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' },
  offline: { label: 'Offline', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' },
};

interface MachineNodeProps {
  machine: CachedMachine;
  isSelected: boolean;
  isDragging?: boolean;
  anyDragging?: boolean;
  isSpacebarDown?: boolean;
  orgSlug: string;
  branchId: string;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onQuickStatusChange: (id: string, newStatus: CachedMachine['status']) => void;
  onRotate?: (id: string) => void;
  onOpenSimulationPopup?: (id: string) => void;
}

export const MachineNode = memo(function MachineNode({
  machine,
  isSelected,
  isDragging = false,
  anyDragging = false,
  isSpacebarDown = false,
  orgSlug,
  branchId,
  onMouseDown,
  onQuickStatusChange,
  onRotate,
  onOpenSimulationPopup,
}: MachineNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const preset = getPresetForType(machine.machine_type);
  const IconComponent = ICON_MAP[preset.iconName] || Sliders;
  const statusCfg = STATUS_CONFIG[machine.status] || STATUS_CONFIG.idle;

  // Custom accent color override
  const accentColor = machine.config_json?.accent_color || preset.color;

  // Live or fallback telemetry values
  const telemetry = machine.config_json?.current_telemetry || {};
  const currentTemp = telemetry.temperature_c ?? preset.specs.nominal_temp_c;
  const currentPower = telemetry.power_kw ?? (machine.status === 'idle' ? 1.5 : preset.specs.rated_power_kw);
  const currentPressure = telemetry.pressure_bar ?? preset.specs.nominal_pressure_bar;
  const currentVibration = telemetry.vibration_mm_s ?? preset.specs.nominal_vib_mm_s;
  const currentLoad = machine.status === 'offline'
    ? 0
    : (machine.config_json?.load ?? Math.min(100, Math.round((currentPower / (preset.specs.rated_power_kw || 20)) * 100)));

  const isOverTemp = currentTemp > (machine.config_json?.max_temp_c ?? preset.specs.max_temp_c);
  const isWarnTemp = currentTemp >= (preset.specs.nominal_temp_c + 10);

  // Extract active resources connected to this machine
  const activeResources: string[] = Array.isArray(machine.config_json?.active_resources) && machine.config_json.active_resources.length > 0
    ? machine.config_json.active_resources
    : [
        ...(machine.machine_type !== 'generator' ? ['electricity'] : []),
        ...(machine.config_json?.primary_resource
          ? [machine.config_json.primary_resource]
          : machine.machine_type === 'boiler' ? ['diesel']
          : machine.machine_type === 'generator' ? ['diesel']
          : machine.machine_type === 'compressor' ? ['petrol']
          : machine.machine_type === 'chiller' ? ['hydrogen']
          : [])
      ];
  const uniqueActiveResources = Array.from(new Set(activeResources));

  const resourceRate = machine.config_json?.resource_rate || (
    machine.machine_type === 'boiler' ? 14.5 :
    machine.machine_type === 'generator' ? 18.0 :
    machine.machine_type === 'compressor' ? 9.5 : 4.0
  );

  const simulationUrl = `/dashboard/${orgSlug}/${branchId}/${machine.id}`;

  // Suppress hovercard when dragging or when spacebar is held for panning
  const showHovercard = isHovered && !isDragging && !anyDragging && !isSpacebarDown;

  const cardWidth = Math.max(195, machine.width || preset.defaultWidth);
  const cardHeight = Math.max(125, machine.height || preset.defaultHeight);

  return (
    <div
      id={`machine-node-${machine.id}`}
      className={`absolute select-none transition-shadow duration-150 group rounded-xl border ${
        isSpacebarDown
          ? 'cursor-grab'
          : isDragging
          ? 'cursor-grabbing ring-2 ring-indigo-500 shadow-2xl scale-[1.02]'
          : isSelected
          ? 'cursor-grab ring-2 ring-indigo-500 shadow-lg'
          : 'cursor-grab shadow-sm hover:shadow-md'
      }`}
      style={{
        left: `${machine.x}px`,
        top: `${machine.y}px`,
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        transform: machine.rotation ? `rotate(${machine.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        backgroundColor: 'var(--bg-primary)',
        borderColor: isSelected || isDragging ? accentColor : 'var(--border)',
        zIndex: isDragging ? 50 : isSelected ? 30 : showHovercard ? 25 : 10,
      }}
      onMouseDown={(e) => {
        if (isSpacebarDown) return; // Allow spacebar pan to pass through to canvas
        onMouseDown(e, machine.id);
      }}
      onDoubleClick={(e) => {
        if (isSpacebarDown) return;
        e.stopPropagation();
        onOpenSimulationPopup?.(machine.id);
      }}
      onMouseEnter={() => {
        if (!anyDragging && !isSpacebarDown) setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Live coordinates floating tooltip while dragging */}
      {isDragging && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-mono font-semibold shadow-lg whitespace-nowrap pointer-events-none flex items-center gap-1 z-50 animate-fade-in">
          <span>X: {machine.x}px</span>
          <span className="opacity-60">|</span>
          <span>Y: {machine.y}px</span>
        </div>
      )}

      {/* Top accent bar */}
      <div
        className="h-1.5 w-full rounded-t-xl"
        style={{ backgroundColor: accentColor }}
      />

      <div className="p-2.5 flex flex-col justify-between h-[calc(100%-6px)]">
        {/* Header: Icon + Name/Type + Power Button + Status badge */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div
              className="p-1 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
            >
              <IconComponent className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <span
                className="text-xs font-bold truncate block tracking-tight"
                style={{ color: 'var(--text-primary)' }}
                title={machine.label}
              >
                {machine.label}
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate block">
                {preset.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Quick Master Power Button (Turn ON / OFF) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickStatusChange(machine.id, machine.status === 'offline' ? 'running' : 'offline');
              }}
              className={`p-1 rounded-lg border transition-all ${
                machine.status === 'offline'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 hover:text-emerald-500'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30'
              }`}
              title={machine.status === 'offline' ? 'Machine is OFF. Click to Power ON' : 'Machine is ON. Click to Turn OFF'}
            >
              <Power className="w-3 h-3" />
            </button>

            {/* Status Indicator Pill */}
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
              style={{
                backgroundColor: statusCfg.bg,
                color: statusCfg.color,
                borderColor: statusCfg.border,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  machine.status === 'running' || machine.status === 'warning' ? 'animate-pulse' : ''
                }`}
                style={{ backgroundColor: statusCfg.color }}
              />
              <span className="capitalize">{machine.status}</span>
            </div>
          </div>
        </div>

        {/* At-A-Glance Basic Operational Metrics (Visible Without Hovering!) */}
        <div className="space-y-1.5 py-1 border-y my-0.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
          {/* Row 1: Temp & Power Draw */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[9px]">Temp:</span>
              <span
                className={`font-mono font-bold ${
                  isOverTemp ? 'text-rose-500' : isWarnTemp ? 'text-amber-500' : 'text-emerald-500'
                }`}
              >
                {machine.status === 'offline' ? '25.0°C' : `${currentTemp.toFixed(1)}°C`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[9px]">⚡ Power:</span>
              <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                {machine.status === 'offline' ? '0.0 kW' : `${currentPower.toFixed(1)} kW`}
              </span>
            </div>
          </div>

          {/* Row 2: Plant Operating Load with Mini Progress Bar */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Load Factor:</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {currentLoad}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700/60 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  currentLoad > 85 ? 'bg-rose-500' : currentLoad > 65 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, currentLoad))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Resource Feeds Strip */}
        <div className="flex items-center justify-between text-[9px] pt-0.5">
          <div className="flex items-center gap-1 overflow-hidden truncate">
            {machine.status === 'offline' ? (
              <span className="text-slate-400 italic text-[9px]">System De-energized</span>
            ) : uniqueActiveResources.length > 0 ? (
              uniqueActiveResources.map((resKey) => {
                if (resKey === 'electricity') {
                  return (
                    <span key={resKey} className="px-1 py-0.2 rounded bg-sky-500/10 text-sky-500 font-mono text-[8.5px] border border-sky-500/20 whitespace-nowrap">
                      ⚡ Grid
                    </span>
                  );
                }
                if (resKey === 'diesel') {
                  return (
                    <span key={resKey} className="px-1 py-0.2 rounded bg-orange-500/10 text-orange-500 font-mono text-[8.5px] border border-orange-500/20 whitespace-nowrap">
                      ⛽ {resourceRate.toFixed(1)} L/h
                    </span>
                  );
                }
                if (resKey === 'petrol') {
                  return (
                    <span key={resKey} className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-mono text-[8.5px] border border-amber-500/20 whitespace-nowrap">
                      ⛽ Petrol
                    </span>
                  );
                }
                if (resKey === 'hydrogen') {
                  return (
                    <span key={resKey} className="px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-500 font-mono text-[8.5px] border border-emerald-500/20 whitespace-nowrap">
                      🧪 H₂ Gas
                    </span>
                  );
                }
                if (resKey === 'kerosene') {
                  return (
                    <span key={resKey} className="px-1 py-0.2 rounded bg-purple-500/10 text-purple-500 font-mono text-[8.5px] border border-purple-500/20 whitespace-nowrap">
                      🛢️ Kero
                    </span>
                  );
                }
                return null;
              })
            ) : (
              <span className="text-slate-400 text-[8.5px]">No active feed</span>
            )}
          </div>

          {/* Secondary Pressure/Vibration readout */}
          <div className="font-mono text-[8.5px] text-slate-400 shrink-0">
            {machine.status === 'offline' ? '0.0 bar' : `${currentPressure.toFixed(1)} bar`}
          </div>
        </div>
      </div>

      {/* Floating Rich Hovercard HUD */}
      {showHovercard && (
        <div
          className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 w-64 rounded-xl border p-3 z-50 animate-fade-in pointer-events-auto shadow-xl"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Machine Header */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {machine.label}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {preset.label}
              </p>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-medium"
              style={{
                backgroundColor: statusCfg.bg,
                color: statusCfg.color,
              }}
            >
              {statusCfg.label}
            </span>
          </div>

          {/* Alert Warning if Over Limit */}
          {isOverTemp && (
            <div className="mb-2 p-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-medium"
                 style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Temp threshold exceeded ({currentTemp.toFixed(1)}°C)!</span>
            </div>
          )}

          {/* Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs mb-3 font-mono">
            <div className="p-1.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Temperature</span>
              <p className="font-semibold text-xs mt-0.5" style={{ color: isOverTemp ? 'var(--danger)' : 'var(--text-primary)' }}>
                {currentTemp.toFixed(1)} °C
              </p>
            </div>
            <div className="p-1.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Power Draw</span>
              <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {currentPower.toFixed(1)} kW
              </p>
            </div>
            <div className="p-1.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Pressure</span>
              <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {currentPressure.toFixed(2)} bar
              </p>
            </div>
            <div className="p-1.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Vibration</span>
              <p className="font-semibold text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {currentVibration.toFixed(3)} mm/s
              </p>
            </div>
          </div>

          {/* Quick Status Bar */}
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>State:</span>
            <div className="flex items-center gap-1">
              {(['running', 'idle', 'warning', 'offline'] as const).map((st) => (
                <button
                  key={st}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickStatusChange(machine.id, st);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-opacity ${
                    machine.status === st ? 'opacity-100 ring-1 ring-offset-1' : 'opacity-40 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: STATUS_CONFIG[st].bg,
                    color: STATUS_CONFIG[st].color,
                  }}
                >
                  {st[0].toUpperCase() + st.slice(1, 4)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons: In-Place Simulator & PC2 Launcher */}
          <div className="flex items-center gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            {onOpenSimulationPopup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSimulationPopup(machine.id);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
                title="Open In-Place Simulation & Resource Controls right on the map"
              >
                <span>⚡ Simulate</span>
              </button>
            )}

            <Link
              href={simulationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg border text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Open full simulation in PC2 dedicated window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {onRotate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRotate(machine.id);
                }}
                className="p-1.5 rounded-lg border text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
