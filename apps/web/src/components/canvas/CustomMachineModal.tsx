'use client';

import React, { useState } from 'react';
import {
  X,
  Sliders,
  Thermometer,
  Snowflake,
  Gauge,
  Zap,
  Fan,
  Activity,
  Flame,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MACHINERY_CATALOG, MachineryPreset } from '@/types/machinery';

const ICONS = [
  { name: 'Thermometer', component: Thermometer },
  { name: 'Snowflake', component: Snowflake },
  { name: 'Gauge', component: Gauge },
  { name: 'Zap', component: Zap },
  { name: 'Fan', component: Fan },
  { name: 'Activity', component: Activity },
  { name: 'Flame', component: Flame },
  { name: 'Layers', component: Layers },
  { name: 'Sliders', component: Sliders },
];

const PALETTE = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#8b5cf6', // purple
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ea580c', // orange
  '#14b8a6', // teal
  '#64748b', // slate
];

interface CustomMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (config: {
    label: string;
    machine_type: string;
    width: number;
    height: number;
    config_json: Record<string, any>;
  }) => void;
}

export function CustomMachineModal({ isOpen, onClose, onCreate }: CustomMachineModalProps) {
  const [selectedPresetType, setSelectedPresetType] = useState<string>('cooling_system');
  const [label, setLabel] = useState('Cooling System 01');
  const [iconName, setIconName] = useState('Thermometer');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [width, setWidth] = useState(140);
  const [height, setHeight] = useState(90);

  // Specs
  const [powerKw, setPowerKw] = useState(18.5);
  const [nominalTemp, setNominalTemp] = useState(65);
  const [maxTemp, setMaxTemp] = useState(85);
  const [nominalPressure, setNominalPressure] = useState(2.8);
  const [maxPressure, setMaxPressure] = useState(5.0);
  const [nominalVib, setNominalVib] = useState(0.35);
  const [zone, setZone] = useState('Production Floor 1');

  if (!isOpen) return null;

  const handleSelectPreset = (preset: MachineryPreset) => {
    setSelectedPresetType(preset.type);
    setLabel(preset.label + ' ' + Math.floor(Math.random() * 90 + 10));
    setIconName(preset.iconName);
    setAccentColor(preset.color);
    setWidth(preset.defaultWidth);
    setHeight(preset.defaultHeight);
    setPowerKw(preset.specs.rated_power_kw);
    setNominalTemp(preset.specs.nominal_temp_c);
    setMaxTemp(preset.specs.max_temp_c);
    setNominalPressure(preset.specs.nominal_pressure_bar);
    setMaxPressure(preset.specs.max_pressure_bar);
    setNominalVib(preset.specs.nominal_vib_mm_s);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    onCreate({
      label: label.trim(),
      machine_type: selectedPresetType,
      width,
      height,
      config_json: {
        accent_color: accentColor,
        icon_name: iconName,
        zone: zone.trim(),
        rated_power_kw: powerKw,
        nominal_temp_c: nominalTemp,
        max_temp_c: maxTemp,
        nominal_pressure_bar: nominalPressure,
        max_pressure_bar: maxPressure,
        nominal_vib_mm_s: nominalVib,
        current_telemetry: {
          temperature_c: nominalTemp,
          power_kw: powerKw,
          pressure_bar: nominalPressure,
          vibration_mm_s: nominalVib,
          efficiency: 0.95,
          timestamp: new Date().toISOString(),
        },
      },
    });

    onClose();
  };

  const SelectedIcon = ICONS.find((i) => i.name === iconName)?.component || Sliders;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl p-6"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Deploy & Customize Machinery
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Choose a baseline equipment preset or tailor custom operational specifications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border text-sm hover:opacity-80 transition-opacity"
            style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Selector Carousel */}
        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            1. Select Baseline Preset ({MACHINERY_CATALOG.length} types)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {MACHINERY_CATALOG.map((p) => {
              const IconComp = ICONS.find((i) => i.name === p.iconName)?.component || Sliders;
              const isSelected = selectedPresetType === p.type;
              return (
                <button
                  type="button"
                  key={p.type}
                  onClick={() => handleSelectPreset(p)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected ? 'ring-2 ring-indigo-500 shadow-sm' : 'hover:border-slate-400 opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    borderColor: isSelected ? p.color : 'var(--border)',
                  }}
                >
                  <div className="p-1.5 rounded-lg w-fit mb-2" style={{ backgroundColor: `${p.color}20`, color: p.color }}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.label}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {p.specs.rated_power_kw} kW
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Label */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Machine Identifier / Tag
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm font-medium"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="e.g. Primary Chiller 01"
              />
            </div>

            {/* Zone */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Floor Zone / Bay Location
              </label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="e.g. Sector 3 - Cleanroom"
              />
            </div>
          </div>

          {/* Color & Icon Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Accent Color
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAccentColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      accentColor === c ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Equipment Icon
              </label>
              <div className="flex items-center gap-1 flex-wrap">
                {ICONS.map((i) => {
                  const Comp = i.component;
                  const isSelected = iconName === i.name;
                  return (
                    <button
                      key={i.name}
                      type="button"
                      onClick={() => setIconName(i.name)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        isSelected ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      style={{ borderColor: isSelected ? 'var(--accent)' : 'var(--border)', color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }}
                      title={i.name}
                    >
                      <Comp className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Canvas Footprint Dimensions */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Footprint Width (px)</span>
                <span className="font-mono">{width} px</span>
              </div>
              <input
                type="range"
                min="80"
                max="260"
                step="10"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-primary)' }}>Footprint Height (px)</span>
                <span className="font-mono">{height} px</span>
              </div>
              <input
                type="range"
                min="60"
                max="180"
                step="10"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* Operating Parameters & Safety Limits */}
          <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Operating Specifications & Causal Bounds
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Power Rating</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.5"
                    value={powerKw}
                    onChange={(e) => setPowerKw(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">kW</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Nominal Temp</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="1"
                    value={nominalTemp}
                    onChange={(e) => setNominalTemp(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">°C</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Critical Alert Temp</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="1"
                    value={maxTemp}
                    onChange={(e) => setMaxTemp(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">°C</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Operating Pressure</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.1"
                    value={nominalPressure}
                    onChange={(e) => setNominalPressure(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">bar</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Max Pressure</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.1"
                    value={maxPressure}
                    onChange={(e) => setMaxPressure(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">bar</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Vib. Baseline</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.05"
                    value={nominalVib}
                    onChange={(e) => setNominalVib(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px]">mm/s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3 rounded-xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                <SelectedIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {label || 'Unnamed Machinery'}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {zone || 'General Sector'} • {width}×{height}px • {powerKw} kW
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600">
              Ready to Place
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Add to Floor Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
