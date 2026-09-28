'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import {
  Activity,
  Zap,
  Thermometer,
  Gauge,
  Sliders,
  Play,
  RotateCcw,
  Radio,
  ExternalLink,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Power,
} from 'lucide-react';
import { CachedMachine } from '@/lib/branchStore';
import { getPresetForType } from '@/types/machinery';

export default function MultiMachineSimulationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const branchId = params.branchId as string;

  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<any>(null);
  const [machines, setMachines] = useState<CachedMachine[]>([]);
  const machinesRef = useRef(machines);
  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  const [activeInterventionMachineId, setActiveInterventionMachineId] = useState<string | null>(null);

  // Single persistent Supabase Realtime channel & debounced DB writer
  const channelRef = useRef<any>(null);
  const dbSaveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Machine local control states: Map of machineId -> { load, fan, coolant, resource, activeResources, resourceRate, temp, power }
  const [controls, setControls] = useState<
    Record<
      string,
      {
        load: number;
        fan: number;
        coolant: number;
        resource: string;
        activeResources: string[];
        resourceRate: number;
        temp: number;
        power: number;
        pressure: number;
        vibration: number;
        isSimulating: boolean;
        simulationCountdown?: number;
        status?: 'running' | 'idle' | 'warning' | 'critical' | 'offline';
      }
    >
  >({});

  // 1. Fetch branch and all machines
  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: bData } = await supabase.from('branches').select('*').eq('id', branchId).single();
      if (!bData) {
        router.replace(`/dashboard/${orgSlug}`);
        return;
      }
      setBranch(bData);

      const { data: mData } = await supabase
        .from('branch_machines')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: true });

      const loadedMachines: CachedMachine[] = mData || [];
      setMachines(loadedMachines);

      // Initialize or non-destructively merge control sliders
      setControls((prevControls) => {
        const nextControls: typeof controls = { ...prevControls };
        loadedMachines.forEach((m) => {
          const preset = getPresetForType(m.machine_type);
          const tele = m.config_json?.current_telemetry || {};
          const existing = prevControls[m.id];

          const defaultActive = Array.isArray(m.config_json?.active_resources) && m.config_json.active_resources.length > 0
            ? m.config_json.active_resources
            : [
                ...(m.machine_type !== 'generator' ? ['electricity'] : []),
                ...(m.config_json?.primary_resource
                  ? [m.config_json.primary_resource]
                  : m.machine_type === 'boiler' ? ['diesel']
                  : m.machine_type === 'generator' ? ['diesel']
                  : m.machine_type === 'compressor' ? ['petrol']
                  : m.machine_type === 'chiller' ? ['hydrogen']
                  : [])
              ];
          const uniqueDefaultActive = Array.from(new Set(defaultActive));

          if (!existing) {
            nextControls[m.id] = {
              load: m.config_json?.load ?? 75,
              fan: m.config_json?.fan ?? 60,
              coolant: m.config_json?.coolant ?? 50,
              resource: m.config_json?.primary_resource ?? (m.machine_type === 'boiler' ? 'diesel' : 'electricity'),
              activeResources: uniqueDefaultActive,
              resourceRate: m.config_json?.resource_rate ?? 12.0,
              temp: tele.temperature_c ?? preset.specs.nominal_temp_c,
              power: tele.power_kw ?? preset.specs.rated_power_kw,
              pressure: tele.pressure_bar ?? preset.specs.nominal_pressure_bar,
              vibration: tele.vibration_mm_s ?? preset.specs.nominal_vib_mm_s,
              isSimulating: false,
              simulationCountdown: 0,
              status: m.status,
            };
          } else {
            // Keep user's active slider inputs intact, merge updated telemetry
            nextControls[m.id] = {
              ...existing,
              activeResources: existing.activeResources ?? uniqueDefaultActive,
              status: m.status,
              temp: tele.temperature_c ?? existing.temp,
              power: tele.power_kw ?? existing.power,
              pressure: tele.pressure_bar ?? existing.pressure,
              vibration: tele.vibration_mm_s ?? existing.vibration,
            };
          }
        });
        return nextControls;
      });
    } catch (e) {
      console.error('Error fetching simulation console data:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, branchId, orgSlug, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 2. Bidirectional Realtime Channel Synchronization (Single Persistent Connection)
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase.channel(`branch_sync_${branchId}`);
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'branch_machines',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as CachedMachine;
            setMachines((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as CachedMachine;
            setMachines((prev) => (prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            setMachines((prev) => prev.filter((m) => m.id !== oldId));
          }
        }
      )
      .on('broadcast', { event: 'telemetry_sync' }, (event) => {
        const { machine_id, telemetry, status } = event.payload || {};
        if (machine_id && telemetry) {
          setControls((prev) => {
            const curr = prev[machine_id];
            if (!curr) return prev;
            return {
              ...prev,
              [machine_id]: {
                ...curr,
                temp: telemetry.temperature_c ?? curr.temp,
                power: telemetry.power_kw ?? curr.power,
                pressure: telemetry.pressure_bar ?? curr.pressure,
                vibration: telemetry.vibration_mm_s ?? curr.vibration,
                resource: telemetry.primary_resource || curr.resource,
                resourceRate: telemetry.resource_rate ?? curr.resourceRate,
              },
            };
          });
          setMachines((prev) =>
            prev.map((m) =>
              m.id === machine_id
                ? {
                    ...m,
                    status: status || m.status,
                    config_json: {
                      ...m.config_json,
                      primary_resource: telemetry.primary_resource || m.config_json?.primary_resource,
                      resource_rate: telemetry.resource_rate ?? m.config_json?.resource_rate,
                      current_telemetry: {
                        ...m.config_json?.current_telemetry,
                        ...telemetry,
                        timestamp: new Date().toISOString(),
                      },
                    },
                  }
                : m
            )
          );
        }
      })
      .on('broadcast', { event: 'branch_telemetry_batch' }, (event) => {
        const { machines: batchMachines } = event.payload || {};
        if (Array.isArray(batchMachines) && batchMachines.length > 0) {
          const idMap = new Map(batchMachines.map((bm: any) => [bm.id, bm]));
          setControls((prev) => {
            const next = { ...prev };
            batchMachines.forEach((bm: any) => {
              if (next[bm.id]) {
                next[bm.id] = {
                  ...next[bm.id],
                  temp: bm.telemetry?.temperature_c ?? next[bm.id].temp,
                  power: bm.telemetry?.power_kw ?? next[bm.id].power,
                  pressure: bm.telemetry?.pressure_bar ?? next[bm.id].pressure,
                  vibration: bm.telemetry?.vibration_mm_s ?? next[bm.id].vibration,
                  resource: bm.telemetry?.primary_resource || next[bm.id].resource,
                  resourceRate: bm.telemetry?.resource_rate ?? next[bm.id].resourceRate,
                };
              }
            });
            return next;
          });
          setMachines((prev) =>
            prev.map((m) => {
              const bm = idMap.get(m.id);
              if (!bm) return m;
              return {
                ...m,
                status: bm.status || m.status,
                config_json: {
                  ...m.config_json,
                  primary_resource: bm.telemetry?.primary_resource || m.config_json?.primary_resource,
                  resource_rate: bm.telemetry?.resource_rate ?? m.config_json?.resource_rate,
                  current_telemetry: {
                    ...m.config_json?.current_telemetry,
                    ...bm.telemetry,
                    timestamp: new Date().toISOString(),
                  },
                },
              };
            })
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [branchId]);

  // 3. Broadcast updates to PC1 floor plan (Immediate WebSocket + 500ms debounced DB write)
  const broadcastMachineUpdate = (
    machineId: string,
    telemetry: Record<string, any>,
    newStatus: CachedMachine['status']
  ) => {
    try {
      // Immediate broadcast to PC1 floor plan (<10ms)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'telemetry_sync',
          payload: {
            machine_id: machineId,
            status: newStatus,
            telemetry,
          },
        });
      }

      // Debounce DB persistence by 500ms to eliminate PostgreSQL write bursts
      if (dbSaveTimeoutRef.current[machineId]) {
        clearTimeout(dbSaveTimeoutRef.current[machineId]);
      }
      dbSaveTimeoutRef.current[machineId] = setTimeout(async () => {
        try {
          const machine = machinesRef.current.find((m) => m.id === machineId);
          await supabase
            .from('branch_machines')
            .update({
              status: newStatus,
              config_json: {
                ...(machine?.config_json || {}),
                primary_resource: telemetry.primary_resource,
                active_resources: telemetry.active_resources || (machine?.config_json as any)?.active_resources,
                resource_rate: telemetry.resource_rate,
                current_telemetry: {
                  ...telemetry,
                  timestamp: new Date().toISOString(),
                },
              },
            })
            .eq('id', machineId);
        } catch (err) {
          console.error('Error persisting machine update in simulation console:', err);
        }
      }, 500);
    } catch (e) {
      console.error('Error broadcasting machine update:', e);
    }
  };

  // Slider change handler with coupled thermodynamic physics and live broadcasting
  const handleSliderChange = (
    machineId: string,
    field: 'load' | 'fan' | 'coolant' | 'resourceRate',
    value: number
  ) => {
    setControls((prev) => {
      const curr = prev[machineId];
      if (!curr) return prev;
      const updated = { ...curr, [field]: value };
      const machine = machinesRef.current.find((m) => m.id === machineId);
      const cfg = machine?.config_json || {};
      const preset = machine ? getPresetForType(machine.machine_type) : null;

      const ratedPower = Number(cfg.rated_power_kw) || preset?.specs.rated_power_kw || 45;
      const nominalTemp = Number(cfg.nominal_temp_c) || preset?.specs.nominal_temp_c || 68;
      const maxTemp = Number(cfg.max_temp_c) || preset?.specs.max_temp_c || 95;
      const nominalPressure = Number(cfg.nominal_pressure_bar) || preset?.specs.nominal_pressure_bar || 4.2;
      const nominalVib = Number(cfg.nominal_vib_mm_s) || preset?.specs.nominal_vib_mm_s || 1.8;

      // Realistic thermodynamic coupling equations
      const loadFactor = updated.load / 100;
      const fanFactor = updated.fan / 100;
      const coolantFactor = updated.coolant / 100;

      const coolingPower = fanFactor * 0.55 + coolantFactor * 0.45;
      const thermalDelta = (loadFactor - coolingPower) * 28.0;
      const estimatedTemp = Math.max(25, Math.min(maxTemp + 20, nominalTemp + thermalDelta));

      // Electrical draw: base load + fan cube law
      const estimatedPower = Math.max(
        1.5,
        ratedPower * loadFactor * 0.85 + Math.pow(fanFactor, 3) * (ratedPower * 0.15) + 1.2
      );

      // Pressure: coolant hydraulic pressure + thermal expansion
      const estimatedPressure = Math.max(
        0.5,
        nominalPressure * (0.5 + coolantFactor * 0.5) * (1 + (estimatedTemp - nominalTemp) * 0.004)
      );

      // Vibration: mechanical imbalance worsens with high load and thermal stress
      const thermalStress = Math.max(0, (estimatedTemp - nominalTemp) / 10);
      const estimatedVib = Math.max(
        0.1,
        nominalVib * (0.6 + loadFactor * 0.4) * (1 + 0.1 * thermalStress)
      );

      // Resource rate
      const baseResource = Number(cfg.resource_rate) || (updated.resource === 'electricity' ? ratedPower : 14.0);
      const estimatedRate = (estimatedPower / ratedPower) * baseResource;

      updated.temp = Math.round(estimatedTemp * 10) / 10;
      updated.power = Math.round(estimatedPower * 10) / 10;
      updated.pressure = Math.round(estimatedPressure * 100) / 100;
      updated.vibration = Math.round(estimatedVib * 100) / 100;
      updated.resourceRate = Math.round(estimatedRate * 10) / 10;

      const isWarn = estimatedTemp >= maxTemp || estimatedVib > nominalVib * 2.2;
      const status: CachedMachine['status'] = isWarn ? 'warning' : 'running';

      broadcastMachineUpdate(
        machineId,
        {
          temperature_c: updated.temp,
          power_kw: updated.power,
          pressure_bar: updated.pressure,
          vibration_mm_s: updated.vibration,
          primary_resource: updated.resource,
          active_resources: updated.activeResources,
          resource_rate: updated.resourceRate,
        },
        status
      );

      return { ...prev, [machineId]: updated };
    });
  };

  // Multi-Select Resource toggle (Turn ON / OFF specific supply feeds)
  const handleToggleResource = (machineId: string, resourceKey: string) => {
    setControls((prev) => {
      const curr = prev[machineId];
      if (!curr) return prev;

      const hasRes = curr.activeResources.includes(resourceKey);
      const nextActiveResources = hasRes
        ? curr.activeResources.filter((r) => r !== resourceKey)
        : [...curr.activeResources, resourceKey];

      const updated = {
        ...curr,
        activeResources: nextActiveResources,
        resource: nextActiveResources[0] || 'none',
      };

      // Broadcast immediately to PC1 floor map (<10ms) and persist to Supabase
      broadcastMachineUpdate(
        machineId,
        {
          temperature_c: updated.temp,
          power_kw: updated.power,
          pressure_bar: updated.pressure,
          vibration_mm_s: updated.vibration,
          primary_resource: updated.resource,
          active_resources: nextActiveResources,
          resource_rate: updated.resourceRate,
        },
        curr.status || 'running'
      );

      return { ...prev, [machineId]: updated };
    });
  };

  // Explicit Sync to Map button
  const handleSyncToMap = (machineId: string) => {
    const ctrl = controls[machineId];
    if (!ctrl) return;
    broadcastMachineUpdate(
      machineId,
      {
        temperature_c: ctrl.temp,
        power_kw: ctrl.power,
        pressure_bar: ctrl.pressure,
        vibration_mm_s: ctrl.vibration,
        primary_resource: ctrl.resource,
        active_resources: ctrl.activeResources,
        resource_rate: ctrl.resourceRate,
      },
      ctrl.status || 'running'
    );
  };

  // Toggle Machine Power ON / OFF
  const handleToggleMachinePower = async (machineId: string) => {
    const ctrl = controls[machineId];
    if (!ctrl) return;
    const isNowOffline = ctrl.status !== 'offline';
    const nextStatus = isNowOffline ? ('offline' as const) : ('running' as const);

    setControls((prev) => ({
      ...prev,
      [machineId]: {
        ...prev[machineId],
        status: nextStatus,
        power: isNowOffline ? 0 : 25,
        temp: isNowOffline ? 25 : prev[machineId].temp,
        resourceRate: isNowOffline ? 0 : prev[machineId].resourceRate,
      },
    }));

    await broadcastMachineUpdate(
      machineId,
      {
        temperature_c: isNowOffline ? 25 : ctrl.temp,
        power_kw: isNowOffline ? 0 : ctrl.power,
        resource_rate: isNowOffline ? 0 : ctrl.resourceRate,
      },
      nextStatus
    );
  };

  // Run full Causal Prediction for a specific machine (Sustained 10-second rollout with live broadcast)
  const handleRunSimulation = async (machineId: string) => {
    const ctrl = controls[machineId];
    if (!ctrl) return;

    setControls((prev) => ({
      ...prev,
      [machineId]: { ...prev[machineId], isSimulating: true, simulationCountdown: 10 },
    }));

    try {
      const state = {
        temperature_c: ctrl.temp,
        pressure_bar: ctrl.pressure,
        power_kw: ctrl.power,
        vibration_mm_s: ctrl.vibration,
        cooling_efficiency: 0.95,
      };

      const actions = Array(10).fill({
        machine_load: ctrl.load,
        fan_speed: ctrl.fan,
        coolant_flow: ctrl.coolant,
      });

      const res = await api.predictActionConditioned(state, actions, { ambient_temperature: 25 });
      const steps = res.steps || [];

      // Step-by-step 10-second rollout: broadcast 1 step per second for 10 seconds
      for (let sec = 1; sec <= 10; sec++) {
        const stepIndex = Math.min(sec - 1, steps.length - 1);
        const currentStep = steps[stepIndex];
        const stepTemp = currentStep?.variables.temperature_c?.mean ?? ctrl.temp;
        const stepPower = currentStep?.variables.power_kw?.mean ?? ctrl.power;
        const remainingSeconds = 10 - sec;

        setControls((prev) => ({
          ...prev,
          [machineId]: {
            ...prev[machineId],
            temp: Math.round(stepTemp * 10) / 10,
            power: Math.round(stepPower * 10) / 10,
            isSimulating: remainingSeconds > 0,
            simulationCountdown: remainingSeconds,
          },
        }));

        const isWarn = stepTemp > 85;
        await broadcastMachineUpdate(
          machineId,
          {
            temperature_c: Math.round(stepTemp * 10) / 10,
            power_kw: Math.round(stepPower * 10) / 10,
            pressure_bar: ctrl.pressure,
            vibration_mm_s: ctrl.vibration,
            primary_resource: ctrl.resource,
            active_resources: ctrl.activeResources,
            resource_rate: ctrl.resourceRate,
          },
          isWarn ? 'warning' : 'running'
        );

        if (remainingSeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (e) {
      console.error('Simulation rollout error:', e);
      setControls((prev) => ({
        ...prev,
        [machineId]: { ...prev[machineId], isSimulating: false, simulationCountdown: 0 },
      }));
    }
  };

  // Aggregate overall facility resource statistics (multi-resource support)
  const totalPower = Object.values(controls)
    .filter((c) => c.status !== 'offline' && (c.activeResources ? c.activeResources.includes('electricity') : true))
    .reduce((acc, c) => acc + (c.power || 0), 0);
  const totalDiesel = Object.values(controls)
    .filter((c) => c.status !== 'offline' && (c.activeResources ? c.activeResources.includes('diesel') : c.resource === 'diesel'))
    .reduce((acc, c) => acc + (c.resourceRate || 0), 0);
  const totalPetrol = Object.values(controls)
    .filter((c) => c.status !== 'offline' && (c.activeResources ? c.activeResources.includes('petrol') : c.resource === 'petrol'))
    .reduce((acc, c) => acc + (c.resourceRate || 0), 0);
  const totalHydrogen = Object.values(controls)
    .filter((c) => c.status !== 'offline' && (c.activeResources ? c.activeResources.includes('hydrogen') : c.resource === 'hydrogen'))
    .reduce((acc, c) => acc + (c.resourceRate || 0), 0);
  const totalKerosene = Object.values(controls)
    .filter((c) => c.status !== 'offline' && (c.activeResources ? c.activeResources.includes('kerosene') : c.resource === 'kerosene'))
    .reduce((acc, c) => acc + (c.resourceRate || 0), 0);

  const avgTemp =
    machines.length > 0
      ? Object.values(controls).reduce((acc, c) => acc + (c.temp || 0), 0) / machines.length
      : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-xs text-slate-400 font-mono">Initializing PC2 Simulation Center...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6 animate-fade-in select-none" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/dashboard/${orgSlug}/${branchId}`}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Floor Plan (PC1)</span>
          </Link>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
            Central Multi-Machine Simulation Center (PC2)
          </span>
        </div>

        {/* Live Multi-Screen Sync Active Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-600 text-xs font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span>PC2 Broadcasting Live to PC1 Floor Plan</span>
        </div>
      </div>

      {/* Header Info */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {branch?.name} — Multi-Machine Simulation Station
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Tweak variables and causal interventions across all machinery simultaneously. All changes instantly stream to the PC1 floor plan map.
        </p>
      </div>

      {/* Aggregate Office-Wide Resource Demand Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Power */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Total Grid Draw</span>
            <Zap className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
            {totalPower.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">kW</span>
          </p>
        </div>

        {/* Diesel Rate */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Diesel Inflow</span>
            <span className="text-xs text-orange-500 font-bold">⛽</span>
          </div>
          <p className="text-xl font-bold font-mono text-orange-500">
            {totalDiesel.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">L/h</span>
          </p>
        </div>

        {/* Petrol Rate */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Petrol Inflow</span>
            <span className="text-xs text-amber-500 font-bold">⛽</span>
          </div>
          <p className="text-xl font-bold font-mono text-amber-500">
            {totalPetrol.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">L/h</span>
          </p>
        </div>

        {/* Hydrogen Gas */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Hydrogen Flow</span>
            <span className="text-xs text-emerald-500 font-bold">🧪</span>
          </div>
          <p className="text-xl font-bold font-mono text-emerald-500">
            {totalHydrogen.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">kg/h</span>
          </p>
        </div>

        {/* Kerosene */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Kerosene Flow</span>
            <span className="text-xs text-purple-500 font-bold">🛢️</span>
          </div>
          <p className="text-xl font-bold font-mono text-purple-500">
            {totalKerosene.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">L/h</span>
          </p>
        </div>

        {/* Mean Thermal */}
        <div className="p-3.5 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-tertiary)' }}>Mean Temp</span>
            <Thermometer className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
            {avgTemp.toFixed(1)} <span className="text-[11px] font-normal text-slate-400">°C</span>
          </p>
        </div>
      </div>

      {/* Machinery Multi-Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {machines.map((machine) => {
          const ctrl = controls[machine.id] || {
            load: 75,
            fan: 60,
            coolant: 50,
            resource: 'electricity',
            resourceRate: 12.0,
            temp: 65,
            power: 18.5,
            pressure: 2.8,
            vibration: 0.35,
            isSimulating: false,
          };

          const preset = getPresetForType(machine.machine_type);
          const isWarn = ctrl.temp > 85;

          return (
            <div
              key={machine.id}
              className="rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between space-y-4"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: isWarn ? 'var(--danger)' : 'var(--border)',
              }}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-1.5 rounded-lg shrink-0"
                      style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
                    >
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {machine.label}
                      </h3>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {preset.label}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Machine Power Switch */}
                    <button
                      onClick={() => handleToggleMachinePower(machine.id)}
                      className={`p-1 rounded-lg border transition-all ${
                        ctrl.status === 'offline'
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 hover:text-emerald-500'
                          : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-500'
                      }`}
                      title={ctrl.status === 'offline' ? 'Machine is OFF. Click to Power ON' : 'Machine is ON. Click to Turn OFF'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${
                        ctrl.status === 'offline'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          : isWarn
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {ctrl.status === 'offline' ? 'Offline' : isWarn ? 'Warning Threshold' : 'Nominal'}
                    </span>
                  </div>
                </div>

                {/* Realtime Sensor Gauges */}
                <div
                  className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs py-2 my-2 rounded-xl border"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <div>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Temp</span>
                    <p className={`font-semibold mt-0.5 ${isWarn ? 'text-red-500' : ''}`}>{ctrl.temp.toFixed(1)}°C</p>
                  </div>
                  <div>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Power</span>
                    <p className="font-semibold mt-0.5">{ctrl.power.toFixed(1)}kW</p>
                  </div>
                  <div>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Pressure</span>
                    <p className="font-semibold mt-0.5">{ctrl.pressure.toFixed(1)}bar</p>
                  </div>
                  <div>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Vib</span>
                    <p className="font-semibold mt-0.5">{ctrl.vibration.toFixed(2)}</p>
                  </div>
                </div>

                {/* Live Sliders */}
                <div className="space-y-3 pt-1">
                  {/* Load */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>Plant Load</span>
                      <span className="font-mono font-semibold">{ctrl.load}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={ctrl.load}
                      onChange={(e) => handleSliderChange(machine.id, 'load', Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  {/* Fan Speed */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>Fan Velocity</span>
                      <span className="font-mono font-semibold">{ctrl.fan}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={ctrl.fan}
                      onChange={(e) => handleSliderChange(machine.id, 'fan', Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  {/* Coolant */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>Coolant Rate</span>
                      <span className="font-mono font-semibold">{ctrl.coolant}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={ctrl.coolant}
                      onChange={(e) => handleSliderChange(machine.id, 'coolant', Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  {/* Multi-Select Resource Supply Toggles */}
                  <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Connected Feeds (Multi-Select):
                      </span>
                      <span className="font-mono text-[10px] text-indigo-500">
                        {ctrl.activeResources?.length || 0} active
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 text-[9px] font-semibold">
                      {[
                        { k: 'electricity', l: '⚡ Grid', color: '#38bdf8' },
                        { k: 'diesel', l: '⛽ Diesel', color: '#f97316' },
                        { k: 'petrol', l: '⛽ Petrol', color: '#eab308' },
                        { k: 'hydrogen', l: '🧪 H2', color: '#10b981' },
                        { k: 'kerosene', l: '🛢️ Kero', color: '#a855f7' },
                      ].map((r) => {
                        const isSelected = ctrl.activeResources?.includes(r.k);
                        return (
                          <button
                            key={r.k}
                            type="button"
                            onClick={() => handleToggleResource(machine.id, r.k)}
                            className={`py-1.5 px-1 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'font-bold shadow-sm'
                                : 'opacity-40 hover:opacity-80'
                            }`}
                            style={{
                              borderColor: isSelected ? r.color : 'var(--border)',
                              backgroundColor: isSelected ? `${r.color}18` : 'transparent',
                              color: isSelected ? r.color : 'var(--text-tertiary)',
                            }}
                            title={`Click to turn ${isSelected ? 'OFF' : 'ON'} ${r.l} feed for this machine`}
                          >
                            <span>{r.l}</span>
                            <span className={`text-[8px] font-mono px-1 rounded ${isSelected ? 'bg-emerald-500/20 text-emerald-500' : 'text-slate-400'}`}>
                              {isSelected ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active feed summary */}
                    <div className="mt-1.5 text-[9px] text-slate-400 font-mono truncate">
                      {!ctrl.activeResources || ctrl.activeResources.length === 0 ? (
                        <span className="text-amber-500 italic">No supply lines connected</span>
                      ) : (
                        <span>Connected: {ctrl.activeResources.map((k) => k.toUpperCase()).join(' + ')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => handleSyncToMap(machine.id)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 shrink-0"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  title="Force immediate broadcast and database sync to PC1 floor plan"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Sync Feeds</span>
                </button>

                <button
                  onClick={() => handleRunSimulation(machine.id)}
                  disabled={ctrl.isSimulating}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: ctrl.isSimulating ? '#6366f1' : 'var(--accent)' }}
                >
                  {ctrl.isSimulating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Rolling Out Trajectory ({ctrl.simulationCountdown ?? 10}s)...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Causal Rollout (10s)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
