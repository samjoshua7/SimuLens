'use client';

import React from 'react';
import {
  Activity,
  Zap,
  Thermometer,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { CachedMachine, CachedBranch, CachedOrg } from '@/lib/branchStore';
import { getPresetForType } from '@/types/machinery';

interface BranchTelemetryViewProps {
  org: CachedOrg;
  branch: CachedBranch;
  machines: CachedMachine[];
  onFocusMachineOnMap: (id: string) => void;
}

export function BranchTelemetryView({
  org,
  branch,
  machines,
  onFocusMachineOnMap,
}: BranchTelemetryViewProps) {
  const totalPower = machines.reduce((acc, m) => {
    const p = m.config_json?.current_telemetry?.power_kw ?? getPresetForType(m.machine_type).specs.rated_power_kw;
    return acc + Number(p || 0);
  }, 0);

  const avgTemp = machines.length > 0
    ? machines.reduce((acc, m) => {
        const t = m.config_json?.current_telemetry?.temperature_c ?? getPresetForType(m.machine_type).specs.nominal_temp_c;
        return acc + Number(t || 0);
      }, 0) / machines.length
    : 0;

  const runningCount = machines.filter((m) => m.status === 'running').length;
  const warningCount = machines.filter((m) => m.status === 'warning' || m.status === 'critical').length;
  const idleCount = machines.filter((m) => m.status === 'idle').length;
  const offlineCount = machines.filter((m) => m.status === 'offline').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Title */}
      <div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Office-System Telemetry & Facility Analytics
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Aggregated real-time metrics across all installed machinery in {branch.name}
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Power */}
        <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Total Grid Load</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono mt-2" style={{ color: 'var(--text-primary)' }}>
            {totalPower.toFixed(1)} <span className="text-xs font-normal text-slate-400">kW</span>
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Across {machines.length} connected equipment units
          </p>
        </div>

        {/* Mean Thermal Index */}
        <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Mean Thermal Index</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
              <Thermometer className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono mt-2" style={{ color: 'var(--text-primary)' }}>
            {avgTemp.toFixed(1)} <span className="text-xs font-normal text-slate-400">°C</span>
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Operational thermal baseline
          </p>
        </div>

        {/* Operating Fleet Status */}
        <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Fleet Availability</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono mt-2" style={{ color: 'var(--text-primary)' }}>
            {machines.length > 0 ? Math.round((runningCount / machines.length) * 100) : 0}%
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            {runningCount} active • {idleCount} idle • {offlineCount} offline
          </p>
        </div>

        {/* Anomaly Alarms */}
        <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Anomalies & Alarms</span>
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono mt-2" style={{ color: warningCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {warningCount} <span className="text-xs font-normal text-slate-400">active</span>
          </p>
          <p className="text-[11px] mt-1" style={{ color: warningCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {warningCount === 0 ? 'All parameters within bounds' : 'Immediate intervention recommended'}
          </p>
        </div>
      </div>

      {/* Equipment Detailed Cards */}
      <div className="rounded-2xl border p-5 shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Live Machinery Telemetry Breakdown
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {machines.map((m) => {
            const preset = getPresetForType(m.machine_type);
            const telemetry = m.config_json?.current_telemetry || {};
            const temp = telemetry.temperature_c ?? preset.specs.nominal_temp_c;
            const power = telemetry.power_kw ?? preset.specs.rated_power_kw;
            const press = telemetry.pressure_bar ?? preset.specs.nominal_pressure_bar;
            const isWarn = temp > (m.config_json?.max_temp_c ?? preset.specs.max_temp_c);

            return (
              <div
                key={m.id}
                className="p-3.5 rounded-xl border flex flex-col justify-between"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {m.label}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${
                        m.status === 'running'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : m.status === 'warning'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-slate-500/10 text-slate-500'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs py-2 my-2 border-y" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Temp</span>
                      <p className={`font-semibold mt-0.5 ${isWarn ? 'text-red-500' : ''}`}>{temp.toFixed(1)}°C</p>
                    </div>
                    <div>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Power</span>
                      <p className="font-semibold mt-0.5">{power.toFixed(1)}kW</p>
                    </div>
                    <div>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Pressure</span>
                      <p className="font-semibold mt-0.5">{press.toFixed(1)}bar</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    onClick={() => onFocusMachineOnMap(m.id)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View on Floor Plan
                  </button>
                  <Link
                    href={`/dashboard/${org.slug}/${branch.id}/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-500 text-white font-medium hover:opacity-90 transition-opacity"
                  >
                    <span>Simulate</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
