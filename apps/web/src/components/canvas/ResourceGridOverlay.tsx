'use client';

import React, { useMemo } from 'react';
import { CachedMachine, ResourcePoolsState, DEFAULT_RESOURCE_POOLS } from '@/lib/branchStore';

export type ResourceType = 'all' | 'electricity' | 'diesel' | 'petrol' | 'hydrogen' | 'kerosene';

interface ResourceGridOverlayProps {
  machines: CachedMachine[];
  canvasWidth: number;
  canvasHeight: number;
  activeFilter?: ResourceType;
  showPipes?: boolean;
  resourcePools?: ResourcePoolsState;
}

interface Pipeline {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  resource: 'electricity' | 'diesel' | 'petrol' | 'hydrogen' | 'kerosene';
  flowRate: number; // controls animation speed
  label: string;
}

const RESOURCE_THEMES = {
  electricity: {
    color: '#38bdf8', // electric cyan
    glow: 'rgba(56, 189, 248, 0.45)',
    strokeWidth: 3,
    dashArray: '8 6',
    duration: 1.1,
    label: 'Electric Bus (415V)',
  },
  diesel: {
    color: '#f97316', // diesel orange
    glow: 'rgba(249, 115, 22, 0.4)',
    strokeWidth: 3.5,
    dashArray: '12 8',
    duration: 1.9,
    label: 'Diesel Fuel Line',
  },
  petrol: {
    color: '#eab308', // petrol amber/yellow
    glow: 'rgba(234, 179, 8, 0.4)',
    strokeWidth: 3,
    dashArray: '10 7',
    duration: 1.7,
    label: 'Gasoline / Petrol',
  },
  hydrogen: {
    color: '#10b981', // hydrogen emerald
    glow: 'rgba(16, 185, 129, 0.45)',
    strokeWidth: 3.5,
    dashArray: '6 5',
    duration: 0.9,
    label: 'Hydrogen Gas (H2)',
  },
  kerosene: {
    color: '#a855f7', // kerosene violet
    glow: 'rgba(168, 85, 247, 0.4)',
    strokeWidth: 3,
    dashArray: '10 8',
    duration: 2.1,
    label: 'Kerosene Line',
  },
};

export const TOP_RESOURCE_STATIONS = [
  { id: 'electricity', label: 'GRID SUBSTATION 415V', icon: '⚡', x: 60, y: 30, w: 180, h: 65, color: '#38bdf8' },
  { id: 'diesel', label: 'DIESEL MANIFOLD', icon: '⛽', x: 280, y: 30, w: 170, h: 65, color: '#f97316' },
  { id: 'petrol', label: 'PETROL / GASOLINE', icon: '⛽', x: 490, y: 30, w: 170, h: 65, color: '#eab308' },
  { id: 'hydrogen', label: 'HYDROGEN CELL BANK', icon: '🧪', x: 700, y: 30, w: 170, h: 65, color: '#10b981' },
  { id: 'kerosene', label: 'KEROSENE RESERVOIR', icon: '🛢️', x: 910, y: 30, w: 170, h: 65, color: '#a855f7' },
] as const;

export function ResourceGridOverlay({
  machines,
  canvasWidth,
  canvasHeight,
  activeFilter = 'all',
  showPipes = true,
  resourcePools = DEFAULT_RESOURCE_POOLS,
}: ResourceGridOverlayProps) {
  // Compute smart grid pipelines
  const pipelines: Pipeline[] = useMemo(() => {
    if (!showPipes || machines.length === 0) return [];

    const lines: Pipeline[] = [];
    const gridOnline = resourcePools.grid_online;

    // Station terminal lookup (center bottom of each top station)
    const stationTerminals: Record<string, { x: number; y: number }> = {};
    TOP_RESOURCE_STATIONS.forEach((st) => {
      stationTerminals[st.id] = {
        x: st.x + st.w / 2,
        y: st.y + st.h,
      };
    });

    // Locate active Genset if available
    const genset = machines.find((m) => m.machine_type === 'generator');
    const gensetRunning = genset && (genset.status === 'running' || genset.status === 'warning');

    // 1. If Grid is OUTAGE and Genset is running: connect Diesel from Top Manifold to Genset
    if (genset) {
      const dieselTerm = stationTerminals.diesel;
      const targetX = genset.x + (genset.width || 120) / 2;
      const targetY = genset.y + 10;
      lines.push({
        id: `genset_fuel_${genset.id}`,
        sourceX: dieselTerm.x,
        sourceY: dieselTerm.y,
        targetX,
        targetY,
        resource: 'diesel',
        flowRate: !gridOnline && gensetRunning ? 2.0 : gensetRunning ? 1.0 : 0.2,
        label: `Genset Diesel Feed`,
      });
    }

    // 2. Iterate through all machines and connect active resource inputs
    machines.forEach((machine) => {
      // Ignore generator's own power draw
      const isGenerator = machine.machine_type === 'generator';
      const isOnline = machine.status !== 'offline';
      const isRunning = machine.status === 'running' || machine.status === 'warning';
      const targetX = machine.x + (machine.width || 120) / 2;
      const targetY = machine.y + 10;

      // Extract all active resources from config_json
      const configuredResources: string[] = [];

      if (Array.isArray(machine.config_json?.active_resources)) {
        machine.config_json.active_resources.forEach((r: string) => {
          if (r && !configuredResources.includes(r)) configuredResources.push(r);
        });
      } else if (Array.isArray(machine.config_json?.resources)) {
        machine.config_json.resources.forEach((r: any) => {
          if (r.active !== false && r.type && !configuredResources.includes(r.type)) configuredResources.push(r.type);
        });
      }

      // If no resources array configured, fallback to standard defaults
      if (configuredResources.length === 0) {
        if (!isGenerator) {
          configuredResources.push('electricity');
        }
        const defaultSecondary =
          machine.config_json?.primary_resource ||
          (machine.machine_type === 'boiler' ? 'diesel' :
           machine.machine_type === 'compressor' ? 'petrol' :
           machine.machine_type === 'chiller' ? 'hydrogen' :
           machine.machine_type === 'custom' ? (machine.config_json?.fuel_type || 'hydrogen') : null);
        if (defaultSecondary && !configuredResources.includes(defaultSecondary)) {
          configuredResources.push(defaultSecondary);
        }
      }

      // Draw conduits for each configured resource
      configuredResources.forEach((resType) => {
        if (resType === 'electricity' && isGenerator) return; // generator outputs electricity, doesn't consume

        // Determine electrical source: normal Grid vs Emergency Genset
        let sourceX = stationTerminals[resType]?.x ?? 150;
        let sourceY = stationTerminals[resType]?.y ?? 95;

        if (resType === 'electricity' && !gridOnline) {
          // If grid is down, power flows from Genset (if running)
          if (genset && gensetRunning) {
            sourceX = genset.x + (genset.width || 120) / 2;
            sourceY = genset.y + (genset.height || 80);
          } else {
            // Power completely out
            return;
          }
        }

        const flowMultiplier = isRunning ? 1.0 : isOnline ? 0.3 : 0.0;
        if (flowMultiplier > 0) {
          lines.push({
            id: `line_${machine.id}_${resType}`,
            sourceX,
            sourceY,
            targetX,
            targetY,
            resource: resType as any,
            flowRate: flowMultiplier,
            label: `${machine.label} (${resType})`,
          });
        }
      });
    });

    return lines;
  }, [machines, canvasWidth, canvasHeight, showPipes, resourcePools]);

  if (!showPipes) return null;

  const filteredLines = activeFilter === 'all'
    ? pipelines
    : pipelines.filter((p) => p.resource === activeFilter);

  // Helper for fuel percentages
  const dieselPct = Math.round((resourcePools.diesel_current_l / resourcePools.diesel_capacity_l) * 100);
  const petrolPct = Math.round((resourcePools.petrol_current_l / resourcePools.petrol_capacity_l) * 100);
  const hydroPct = Math.round((resourcePools.hydrogen_current_kg / resourcePools.hydrogen_capacity_kg) * 100);
  const keroPct = Math.round((resourcePools.kerosene_current_l / resourcePools.kerosene_capacity_l) * 100);

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-15 overflow-visible"
      width={canvasWidth}
      height={canvasHeight}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
    >
      <defs>
        {/* Glow filters for energetic currents */}
        <filter id="electric-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="fuel-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Global Keyframes for flowing pipes */}
        <style>
          {`
            @keyframes flowElectric {
              from { stroke-dashoffset: 28; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes flowFluid {
              from { stroke-dashoffset: 40; }
              to { stroke-dashoffset: 0; }
            }
            .flow-electricity {
              animation: flowElectric 0.9s linear infinite;
            }
            .flow-diesel {
              animation: flowFluid 1.8s linear infinite;
            }
            .flow-petrol {
              animation: flowFluid 1.5s linear infinite;
            }
            .flow-hydrogen {
              animation: flowElectric 0.75s linear infinite;
            }
            .flow-kerosene {
              animation: flowFluid 2.0s linear infinite;
            }
          `}
        </style>
      </defs>

      {/* ============================================================== */}
      {/* Top Industrial Resource Distribution Stations (Aligned at Y=30) */}
      {/* ============================================================== */}

      {/* 1. Grid Substation 415V */}
      <g transform={`translate(${TOP_RESOURCE_STATIONS[0].x}, ${TOP_RESOURCE_STATIONS[0].y})`}>
        <rect
          width={TOP_RESOURCE_STATIONS[0].w}
          height={TOP_RESOURCE_STATIONS[0].h}
          rx="10"
          fill="#0f172a"
          stroke={resourcePools.grid_online ? '#38bdf8' : '#ef4444'}
          strokeWidth="2"
        />
        <text x="24" y="28" fill={resourcePools.grid_online ? '#38bdf8' : '#ef4444'} fontSize="16" fontWeight="bold">
          {resourcePools.grid_online ? '⚡' : '⚠️'}
        </text>
        <text x="44" y="24" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {TOP_RESOURCE_STATIONS[0].label}
        </text>
        <text
          x="44"
          y="40"
          fill={resourcePools.grid_online ? '#38bdf8' : '#ef4444'}
          fontSize="9"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {resourcePools.grid_online ? 'STATUS: ONLINE (415V)' : 'STATUS: GRID OUTAGE (0V)'}
        </text>
        {/* Terminal Port */}
        <circle cx={TOP_RESOURCE_STATIONS[0].w / 2} cy={TOP_RESOURCE_STATIONS[0].h} r="5" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
      </g>

      {/* 2. Diesel Manifold */}
      <g transform={`translate(${TOP_RESOURCE_STATIONS[1].x}, ${TOP_RESOURCE_STATIONS[1].y})`}>
        <rect
          width={TOP_RESOURCE_STATIONS[1].w}
          height={TOP_RESOURCE_STATIONS[1].h}
          rx="10"
          fill="#0f172a"
          stroke={dieselPct < 20 ? '#ef4444' : '#f97316'}
          strokeWidth="2"
        />
        <text x="22" y="28" fill="#f97316" fontSize="16">⛽</text>
        <text x="42" y="22" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {TOP_RESOURCE_STATIONS[1].label}
        </text>
        <text x="42" y="38" fill="#94a3b8" fontSize="9" fontFamily="monospace">
          {resourcePools.diesel_current_l.toFixed(0)} / {resourcePools.diesel_capacity_l} L ({dieselPct}%)
        </text>
        {/* Mini Level Gauge Bar */}
        <rect x="42" y="44" width="110" height="5" rx="2.5" fill="#334155" />
        <rect
          x="42"
          y="44"
          width={Math.max(2, (110 * dieselPct) / 100)}
          height="5"
          rx="2.5"
          fill={dieselPct < 20 ? '#ef4444' : '#f97316'}
        />
        {/* Terminal Port */}
        <circle cx={TOP_RESOURCE_STATIONS[1].w / 2} cy={TOP_RESOURCE_STATIONS[1].h} r="5" fill="#f97316" stroke="#0f172a" strokeWidth="2" />
      </g>

      {/* 3. Petrol / Gasoline Header */}
      <g transform={`translate(${TOP_RESOURCE_STATIONS[2].x}, ${TOP_RESOURCE_STATIONS[2].y})`}>
        <rect
          width={TOP_RESOURCE_STATIONS[2].w}
          height={TOP_RESOURCE_STATIONS[2].h}
          rx="10"
          fill="#0f172a"
          stroke={petrolPct < 20 ? '#ef4444' : '#eab308'}
          strokeWidth="2"
        />
        <text x="22" y="28" fill="#eab308" fontSize="16">⛽</text>
        <text x="42" y="22" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {TOP_RESOURCE_STATIONS[2].label}
        </text>
        <text x="42" y="38" fill="#94a3b8" fontSize="9" fontFamily="monospace">
          {resourcePools.petrol_current_l.toFixed(0)} / {resourcePools.petrol_capacity_l} L ({petrolPct}%)
        </text>
        {/* Mini Level Gauge Bar */}
        <rect x="42" y="44" width="110" height="5" rx="2.5" fill="#334155" />
        <rect
          x="42"
          y="44"
          width={Math.max(2, (110 * petrolPct) / 100)}
          height="5"
          rx="2.5"
          fill={petrolPct < 20 ? '#ef4444' : '#eab308'}
        />
        {/* Terminal Port */}
        <circle cx={TOP_RESOURCE_STATIONS[2].w / 2} cy={TOP_RESOURCE_STATIONS[2].h} r="5" fill="#eab308" stroke="#0f172a" strokeWidth="2" />
      </g>

      {/* 4. Hydrogen H2 Bank */}
      <g transform={`translate(${TOP_RESOURCE_STATIONS[3].x}, ${TOP_RESOURCE_STATIONS[3].y})`}>
        <rect
          width={TOP_RESOURCE_STATIONS[3].w}
          height={TOP_RESOURCE_STATIONS[3].h}
          rx="10"
          fill="#0f172a"
          stroke={hydroPct < 20 ? '#ef4444' : '#10b981'}
          strokeWidth="2"
        />
        <text x="22" y="28" fill="#10b981" fontSize="14" fontWeight="bold">🧪</text>
        <text x="42" y="22" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {TOP_RESOURCE_STATIONS[3].label}
        </text>
        <text x="42" y="38" fill="#94a3b8" fontSize="9" fontFamily="monospace">
          {resourcePools.hydrogen_current_kg.toFixed(1)} / {resourcePools.hydrogen_capacity_kg} kg ({hydroPct}%)
        </text>
        {/* Mini Level Gauge Bar */}
        <rect x="42" y="44" width="110" height="5" rx="2.5" fill="#334155" />
        <rect
          x="42"
          y="44"
          width={Math.max(2, (110 * hydroPct) / 100)}
          height="5"
          rx="2.5"
          fill={hydroPct < 20 ? '#ef4444' : '#10b981'}
        />
        {/* Terminal Port */}
        <circle cx={TOP_RESOURCE_STATIONS[3].w / 2} cy={TOP_RESOURCE_STATIONS[3].h} r="5" fill="#10b981" stroke="#0f172a" strokeWidth="2" />
      </g>

      {/* 5. Kerosene Reservoir */}
      <g transform={`translate(${TOP_RESOURCE_STATIONS[4].x}, ${TOP_RESOURCE_STATIONS[4].y})`}>
        <rect
          width={TOP_RESOURCE_STATIONS[4].w}
          height={TOP_RESOURCE_STATIONS[4].h}
          rx="10"
          fill="#0f172a"
          stroke={keroPct < 20 ? '#ef4444' : '#a855f7'}
          strokeWidth="2"
        />
        <text x="22" y="28" fill="#a855f7" fontSize="15">🛢️</text>
        <text x="42" y="22" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {TOP_RESOURCE_STATIONS[4].label}
        </text>
        <text x="42" y="38" fill="#94a3b8" fontSize="9" fontFamily="monospace">
          {resourcePools.kerosene_current_l.toFixed(0)} / {resourcePools.kerosene_capacity_l} L ({keroPct}%)
        </text>
        {/* Mini Level Gauge Bar */}
        <rect x="42" y="44" width="110" height="5" rx="2.5" fill="#334155" />
        <rect
          x="42"
          y="44"
          width={Math.max(2, (110 * keroPct) / 100)}
          height="5"
          rx="2.5"
          fill={keroPct < 20 ? '#ef4444' : '#a855f7'}
        />
        {/* Terminal Port */}
        <circle cx={TOP_RESOURCE_STATIONS[4].w / 2} cy={TOP_RESOURCE_STATIONS[4].h} r="5" fill="#a855f7" stroke="#0f172a" strokeWidth="2" />
      </g>

      {/* ============================================================== */}
      {/* Flowing Conduits & Resource Pipelines                           */}
      {/* ============================================================== */}
      {filteredLines.map((line) => {
        const theme = RESOURCE_THEMES[line.resource];
        // Calculate organic bezier path descending from top stations into machines
        const midY = (line.sourceY + line.targetY) / 2;
        const pathData = `M ${line.sourceX} ${line.sourceY} C ${line.sourceX} ${midY}, ${line.targetX} ${midY}, ${line.targetX} ${line.targetY}`;
        const animClass = `flow-${line.resource}`;

        return (
          <g key={line.id} opacity={line.flowRate > 0.5 ? 0.95 : 0.55}>
            {/* Background conduit casing */}
            <path
              d={pathData}
              fill="none"
              stroke="#1e293b"
              strokeWidth={theme.strokeWidth + 3}
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Glowing animated inner core */}
            <path
              d={pathData}
              fill="none"
              stroke={theme.color}
              strokeWidth={theme.strokeWidth}
              strokeDasharray={theme.dashArray}
              strokeLinecap="round"
              className={animClass}
              style={{
                filter: line.resource === 'electricity' || line.resource === 'hydrogen' ? 'url(#electric-glow)' : 'url(#fuel-glow)',
                animationDuration: `${theme.duration / Math.max(0.2, line.flowRate)}s`,
              }}
            />

            {/* Target Machine Input Port Terminal Dot */}
            <circle
              cx={line.targetX}
              cy={line.targetY}
              r={4}
              fill={theme.color}
              stroke="#0f172a"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}
