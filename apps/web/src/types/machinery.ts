// =============================================================================
// SimuLens — Industrial Machinery Catalog & Customization Types
// =============================================================================

export interface MachineryPreset {
  type: string;
  label: string;
  category: string;
  iconName: string;
  color: string;
  defaultWidth: number;
  defaultHeight: number;
  description: string;
  specs: {
    rated_power_kw: number;
    nominal_temp_c: number;
    max_temp_c: number;
    nominal_pressure_bar: number;
    max_pressure_bar: number;
    nominal_vib_mm_s: number;
  };
}

export const MACHINERY_CATALOG: MachineryPreset[] = [
  {
    type: 'cooling_system',
    label: 'Cooling System Tower',
    category: 'Thermal & Heat Exchanger',
    iconName: 'Thermometer',
    color: '#3b82f6',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Evaporative cooling tower with variable fan speed & coolant circulation',
    specs: {
      rated_power_kw: 18.5,
      nominal_temp_c: 65,
      max_temp_c: 85,
      nominal_pressure_bar: 2.8,
      max_pressure_bar: 5.0,
      nominal_vib_mm_s: 0.35,
    },
  },
  {
    type: 'chiller',
    label: 'Centrifugal Chiller',
    category: 'Thermal & Refrigeration',
    iconName: 'Snowflake',
    color: '#06b6d4',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Industrial water-cooled centrifugal chiller for process cooling',
    specs: {
      rated_power_kw: 45.0,
      nominal_temp_c: 8,
      max_temp_c: 18,
      nominal_pressure_bar: 4.2,
      max_pressure_bar: 8.0,
      nominal_vib_mm_s: 0.28,
    },
  },
  {
    type: 'compressor',
    label: 'Rotary Screw Compressor',
    category: 'Pneumatics & Pressure',
    iconName: 'Gauge',
    color: '#8b5cf6',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Continuous dual-screw air compressor for pneumatic facility lines',
    specs: {
      rated_power_kw: 30.0,
      nominal_temp_c: 72,
      max_temp_c: 98,
      nominal_pressure_bar: 7.5,
      max_pressure_bar: 11.0,
      nominal_vib_mm_s: 0.55,
    },
  },
  {
    type: 'motor',
    label: 'High-Voltage VFD Motor',
    category: 'Electromechanical & Drives',
    iconName: 'Zap',
    color: '#f59e0b',
    defaultWidth: 195,
    defaultHeight: 125,
    description: '3-phase AC induction motor with inverter-driven frequency modulation',
    specs: {
      rated_power_kw: 22.0,
      nominal_temp_c: 58,
      max_temp_c: 82,
      nominal_pressure_bar: 1.0,
      max_pressure_bar: 2.0,
      nominal_vib_mm_s: 0.40,
    },
  },
  {
    type: 'hvac',
    label: 'HVAC Air Handling Unit',
    category: 'Climate & Airflow',
    iconName: 'Fan',
    color: '#10b981',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Central air handler with filtration, damper controls, and reheat coils',
    specs: {
      rated_power_kw: 15.0,
      nominal_temp_c: 21,
      max_temp_c: 32,
      nominal_pressure_bar: 1.2,
      max_pressure_bar: 2.5,
      nominal_vib_mm_s: 0.22,
    },
  },
  {
    type: 'pump',
    label: 'Centrifugal Slurry Pump',
    category: 'Hydraulics & Fluids',
    iconName: 'Activity',
    color: '#ef4444',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'High-throughput fluid transfer pump with mechanical seal monitor',
    specs: {
      rated_power_kw: 11.5,
      nominal_temp_c: 48,
      max_temp_c: 75,
      nominal_pressure_bar: 5.2,
      max_pressure_bar: 9.0,
      nominal_vib_mm_s: 0.48,
    },
  },
  {
    type: 'boiler',
    label: 'Industrial Steam Boiler',
    category: 'Thermal & Steam',
    iconName: 'Flame',
    color: '#ea580c',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'High-pressure fire-tube steam generation boiler with safety interlocks',
    specs: {
      rated_power_kw: 55.0,
      nominal_temp_c: 155,
      max_temp_c: 190,
      nominal_pressure_bar: 8.5,
      max_pressure_bar: 14.0,
      nominal_vib_mm_s: 0.32,
    },
  },
  {
    type: 'generator',
    label: 'Backup GenSet / BESS',
    category: 'Power & Grid Storage',
    iconName: 'Zap',
    color: '#eab308',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'High-capacity standby power generation and battery storage rack',
    specs: {
      rated_power_kw: 85.0,
      nominal_temp_c: 42,
      max_temp_c: 65,
      nominal_pressure_bar: 1.0,
      max_pressure_bar: 2.0,
      nominal_vib_mm_s: 0.20,
    },
  },
  {
    type: 'conveyor',
    label: 'Automated Conveyor Line',
    category: 'Material Handling',
    iconName: 'Layers',
    color: '#14b8a6',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Variable-speed roller conveyor with optical load sensors',
    specs: {
      rated_power_kw: 7.5,
      nominal_temp_c: 38,
      max_temp_c: 55,
      nominal_pressure_bar: 1.0,
      max_pressure_bar: 1.5,
      nominal_vib_mm_s: 0.25,
    },
  },
  {
    type: 'custom',
    label: 'Custom Machinery',
    category: 'Specialized / User-Defined',
    iconName: 'Sliders',
    color: '#6366f1',
    defaultWidth: 195,
    defaultHeight: 125,
    description: 'Fully customizable equipment with tailored parameters, thresholds, and dimensions',
    specs: {
      rated_power_kw: 20.0,
      nominal_temp_c: 50,
      max_temp_c: 80,
      nominal_pressure_bar: 3.0,
      max_pressure_bar: 6.0,
      nominal_vib_mm_s: 0.30,
    },
  },
];

export function getPresetForType(type: string): MachineryPreset {
  const found = MACHINERY_CATALOG.find((m) => m.type === type);
  return found || MACHINERY_CATALOG[MACHINERY_CATALOG.length - 1]; // fallback to custom
}
