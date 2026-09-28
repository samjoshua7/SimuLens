'use client';

import React, { useMemo } from 'react';
import { CachedMachine } from '@/lib/branchStore';

export type ResourceType = 'all' | 'electricity' | 'diesel' | 'petrol' | 'hydrogen' | 'kerosene';

interface ResourceGridOverlayProps {
  machines: CachedMachine[];
  canvasWidth: number;
  canvasHeight: number;
  activeFilter?: ResourceType;
  showPipes?: boolean;
}

interface Pipeline {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  resource: 'electricity' | 'diesel' | 'petrol' | 'hydrogen' | 'kerosene';
  flowRate: number; // 0 to 1, controls animation speed
  label: string;
}

const RESOURCE_THEMES = {
  electricity: {
    color: '#38bdf8', // bright electric cyan
    glow: 'rgba(56, 189, 248, 0.4)',
    strokeWidth: 3,
    dashArray: '8 6',
    duration: 1.2,
    label: 'Electric Bus (415V)',
  },
  diesel: {
    color: '#f97316', // diesel orange
    glow: 'rgba(249, 115, 22, 0.35)',
    strokeWidth: 3.5,
    dashArray: '12 8',
    duration: 2.0,
    label: 'Diesel Fuel Line',
  },
  petrol: {
    color: '#eab308', // petrol amber/yellow
    glow: 'rgba(234, 179, 8, 0.35)',
    strokeWidth: 3,
    dashArray: '10 7',
    duration: 1.8,
    label: 'Gasoline / Petrol',
  },
  hydrogen: {
    color: '#10b981', // hydrogen emerald/cyan
    glow: 'rgba(16, 185, 129, 0.4)',
    strokeWidth: 3.5,
    dashArray: '6 5',
    duration: 1.0,
    label: 'Hydrogen Gas (H2)',
  },
  kerosene: {
    color: '#a855f7', // kerosene violet
    glow: 'rgba(168, 85, 247, 0.35)',
    strokeWidth: 3,
    dashArray: '10 8',
    duration: 2.2,
    label: 'Kerosene Line',
  },
};

export function ResourceGridOverlay({
  machines,
  canvasWidth,
  canvasHeight,
  activeFilter = 'all',
  showPipes = true,
}: ResourceGridOverlayProps) {
  // Compute smart grid pipelines
  const pipelines: Pipeline[] = useMemo(() => {
    if (!showPipes || machines.length === 0) return [];

    const lines: Pipeline[] = [];

    // Find designated generators / power sources if available
    const powerSource = machines.find((m) => m.machine_type === 'generator') || {
      id: 'substation',
      x: 60,
      y: 60,
      width: 140,
      height: 80,
    };

    // Central fuel manifold position
    const fuelHub = {
      x: 80,
      y: Math.min(canvasHeight - 120, 600),
    };

    // Gas header position
    const gasHub = {
      x: Math.min(canvasWidth - 140, 1200),
      y: 80,
    };

    machines.forEach((machine) => {
      // Machine center
      const targetX = machine.x + (machine.width || 120) / 2;
      const targetY = machine.y + (machine.height || 80) / 2;

      // 1. Electric Power Line for all machines (except generator itself)
      if (machine.id !== (powerSource as any).id) {
        const sourceX = (powerSource as any).x + (powerSource as any).width / 2;
        const sourceY = (powerSource as any).y + (powerSource as any).height / 2;
        const isRunning = machine.status === 'running' || machine.status === 'warning';
        lines.push({
          id: `elec_${machine.id}`,
          sourceX,
          sourceY,
          targetX,
          targetY,
          resource: 'electricity',
          flowRate: isRunning ? 1.0 : 0.25,
          label: `${machine.label} (Power)`,
        });
      }

      // 2. Resource pipelines based on machine type or config
      const resourceType = machine.config_json?.primary_resource ||
        (machine.machine_type === 'boiler' ? 'diesel' :
         machine.machine_type === 'generator' ? 'diesel' :
         machine.machine_type === 'compressor' ? 'petrol' :
         machine.machine_type === 'chiller' ? 'hydrogen' :
         machine.machine_type === 'custom' ? (machine.config_json?.fuel_type || 'hydrogen') : null);

      if (resourceType && RESOURCE_THEMES[resourceType as keyof typeof RESOURCE_THEMES]) {
        const isGas = resourceType === 'hydrogen';
        const sX = isGas ? gasHub.x : fuelHub.x;
        const sY = isGas ? gasHub.y : fuelHub.y;
        const isRunning = machine.status === 'running';

        lines.push({
          id: `fuel_${machine.id}_${resourceType}`,
          sourceX: sX,
          sourceY: sY,
          targetX,
          targetY,
          resource: resourceType as any,
          flowRate: isRunning ? 1.2 : 0.2,
          label: `${machine.label} (${resourceType})`,
        });
      }
    });

    return lines;
  }, [machines, canvasWidth, canvasHeight, showPipes]);

  if (!showPipes) return null;

  const filteredLines = activeFilter === 'all'
    ? pipelines
    : pipelines.filter((p) => p.resource === activeFilter);

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
            .flow-electric {
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

      {/* Facility Distribution Hub Icons / Terminals */}
      {/* Central Substation Terminal */}
      <g transform="translate(40, 40)">
        <rect width="40" height="40" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
        <text x="20" y="25" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="bold">⚡</text>
        <text x="20" y="52" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">GRID 415V</text>
      </g>

      {/* Liquid Fuel Header */}
      <g transform={`translate(60, ${Math.min(canvasHeight - 140, 580)})`}>
        <rect width="40" height="40" rx="8" fill="#0f172a" stroke="#f97316" strokeWidth="2" />
        <text x="20" y="25" textAnchor="middle" fill="#f97316" fontSize="14" fontWeight="bold">⛽</text>
        <text x="20" y="52" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">FUEL MANIFOLD</text>
      </g>

      {/* Hydrogen Storage Terminal */}
      <g transform={`translate(${Math.min(canvasWidth - 160, 1180)}, 60)`}>
        <rect width="40" height="40" rx="8" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
        <text x="20" y="25" textAnchor="middle" fill="#10b981" fontSize="12" fontWeight="bold">H₂</text>
        <text x="20" y="52" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">H2 CELL</text>
      </g>

      {/* Render Pipelines */}
      {filteredLines.map((line) => {
        const theme = RESOURCE_THEMES[line.resource];
        // Calculate elbow/bezier path
        const midX = (line.sourceX + line.targetX) / 2;
        const pathData = `M ${line.sourceX} ${line.sourceY} C ${midX} ${line.sourceY}, ${midX} ${line.targetY}, ${line.targetX} ${line.targetY}`;
        const animClass = `flow-${line.resource}`;

        return (
          <g key={line.id} opacity={line.flowRate > 0.5 ? 0.95 : 0.55}>
            {/* Background conduit / pipe pipe casing */}
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
                animationDuration: `${theme.duration / line.flowRate}s`,
              }}
            />

            {/* Target Connection Terminal Dot */}
            <circle
              cx={line.targetX}
              cy={line.targetY}
              r={3.5}
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
