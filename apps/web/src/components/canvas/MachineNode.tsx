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
  orgSlug: string;
  branchId: string;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onQuickStatusChange: (id: string, newStatus: CachedMachine['status']) => void;
  onRotate?: (id: string) => void;
}

export const MachineNode = memo(function MachineNode({
  machine,
  isSelected,
  orgSlug,
  branchId,
  onMouseDown,
  onQuickStatusChange,
  onRotate,
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

  const isOverTemp = currentTemp > (machine.config_json?.max_temp_c ?? preset.specs.max_temp_c);

  const simulationUrl = `/dashboard/${orgSlug}/${branchId}/${machine.id}`;

  return (
    <div
      id={`machine-node-${machine.id}`}
      className={`absolute select-none cursor-grab active:cursor-grabbing transition-shadow duration-150 group rounded-xl border ${
        isSelected ? 'ring-2 ring-indigo-500 shadow-lg' : 'shadow-sm hover:shadow-md'
      }`}
      style={{
        left: `${machine.x}px`,
        top: `${machine.y}px`,
        width: `${machine.width || preset.defaultWidth}px`,
        height: `${machine.height || preset.defaultHeight}px`,
        transform: machine.rotation ? `rotate(${machine.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        backgroundColor: 'var(--bg-primary)',
        borderColor: isSelected ? accentColor : 'var(--border)',
        zIndex: isSelected ? 30 : isHovered ? 25 : 10,
      }}
      onMouseDown={(e) => onMouseDown(e, machine.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Top accent bar */}
      <div
        className="h-1.5 w-full rounded-t-xl"
        style={{ backgroundColor: accentColor }}
      />

      <div className="p-2.5 flex flex-col justify-between h-[calc(100%-6px)]">
        {/* Header: Icon + Status badge */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="p-1.5 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
            >
              <IconComponent className="w-4 h-4" />
            </div>
            <span
              className="text-xs font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
              title={machine.label}
            >
              {machine.label}
            </span>
          </div>

          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
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

        {/* Live Mini Telemetry Readout */}
        <div className="grid grid-cols-2 gap-1.5 mt-1 pt-1 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1">
            <span style={{ color: 'var(--text-tertiary)' }}>T:</span>
            <span
              className="font-mono font-medium"
              style={{ color: isOverTemp ? 'var(--danger)' : 'var(--text-primary)' }}
            >
              {currentTemp.toFixed(1)}°C
            </span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span style={{ color: 'var(--text-tertiary)' }}>P:</span>
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {currentPower.toFixed(1)} kW
            </span>
          </div>
        </div>
      </div>

      {/* Floating Rich Hovercard HUD */}
      {isHovered && (
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

          {/* Action Buttons: PC2 Causal Simulator Launcher */}
          <div className="flex items-center gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <Link
              href={simulationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ backgroundColor: 'var(--accent)' }}
              title="Open Causal Simulation & Interventions in a new window/tab (ideal for multi-monitor PC2 setup)"
            >
              <span>Launch Simulator</span>
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
