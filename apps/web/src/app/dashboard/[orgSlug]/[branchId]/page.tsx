'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import {
  branchStore,
  CachedMachine,
  CachedBranch,
  CachedOrg,
} from '@/lib/branchStore';
import { MACHINERY_CATALOG, getPresetForType } from '@/types/machinery';
import { MachineNode } from '@/components/canvas/MachineNode';
import { BranchSideNav, BranchViewMode } from '@/components/canvas/BranchSideNav';
import { OfficeStatsBar } from '@/components/canvas/OfficeStatsBar';
import { CustomMachineModal } from '@/components/canvas/CustomMachineModal';
import { BranchTelemetryView } from '@/components/canvas/BranchTelemetryView';

export default function BranchCanvasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const branchId = params.branchId as string;

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize from client memory cache to eliminate full-page reload flashes
  const cached = branchStore.get(branchId);
  const [org, setOrg] = useState<CachedOrg | null>(cached ? cached.org : null);
  const [branch, setBranch] = useState<CachedBranch | null>(cached ? cached.branch : null);
  const [machines, setMachines] = useState<CachedMachine[]>(cached ? cached.machines : []);
  const [loading, setLoading] = useState(!cached);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  // Active view
  const [activeView, setActiveView] = useState<BranchViewMode>('canvas');

  // Drag and selection state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Custom machine creation modal
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Canvas pan / zoom (cached)
  const initialTransform = branchStore.getTransform(branchId);
  const [pan, setPan] = useState(initialTransform.pan);
  const [zoom, setZoom] = useState(initialTransform.zoom);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Update store when pan/zoom changes
  const updateTransform = (newPan: { x: number; y: number }, newZoom: number) => {
    setPan(newPan);
    setZoom(newZoom);
    branchStore.setTransform(branchId, newPan, newZoom);
  };

  // ---- Data loading (Silent background refresh if cached) ----
  const fetchData = useCallback(async (isInitial = false) => {
    if (!user) return;
    if (isInitial && !branchStore.has(branchId)) {
      setLoading(true);
    }

    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .eq('slug', orgSlug)
        .single();

      if (!orgData) {
        router.replace('/dashboard');
        return;
      }
      setOrg(orgData);

      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .single();

      if (!branchData) {
        router.replace(`/dashboard/${orgSlug}`);
        return;
      }
      setBranch(branchData);

      const { data: machineData } = await supabase
        .from('branch_machines')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: true });

      const loadedMachines: CachedMachine[] = machineData || [];
      setMachines(loadedMachines);

      // Save to memory cache
      branchStore.set(branchId, orgData, branchData, loadedMachines);
    } catch (err) {
      console.error('Error fetching branch data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, orgSlug, branchId, router]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // ---- Realtime & Multi-Screen Synchronization (PC1 ↔ PC2) ----
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase.channel(`branch_sync_${branchId}`)
      // 1. Listen for database changes on branch_machines
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'branch_machines',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMachine = payload.new as CachedMachine;
            setMachines((prev) => {
              if (prev.some((m) => m.id === newMachine.id)) return prev;
              const next = [...prev, newMachine];
              branchStore.updateMachines(branchId, next);
              return next;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as CachedMachine;
            setMachines((prev) => {
              const next = prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
              branchStore.updateMachines(branchId, next);
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            setMachines((prev) => {
              const next = prev.filter((m) => m.id !== oldId);
              branchStore.updateMachines(branchId, next);
              return next;
            });
          }
        }
      )
      // 2. Listen for broadcast telemetry from PC2 simulation engine
      .on('broadcast', { event: 'telemetry_sync' }, (event) => {
        const { machine_id, telemetry, status } = event.payload || {};
        if (machine_id && telemetry) {
          setMachines((prev) => {
            const next = prev.map((m) => {
              if (m.id !== machine_id) return m;
              return {
                ...m,
                status: status || m.status,
                config_json: {
                  ...m.config_json,
                  current_telemetry: {
                    ...m.config_json?.current_telemetry,
                    ...telemetry,
                    timestamp: new Date().toISOString(),
                  },
                },
              };
            });
            branchStore.updateMachines(branchId, next);
            return next;
          });
        }
      })
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    // Gentle 4-second background poller (no UI flicker) as fallback
    const interval = setInterval(() => {
      fetchData(false);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [branchId, fetchData]);

  // ---- Drag & Pan Handlers ----
  const handleMouseDownNode = (e: React.MouseEvent, machineId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    setDraggingId(machineId);
    setSelectedId(machineId);
    setDragOffset({ x: mouseX - machine.x, y: mouseY - machine.y });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning && canvasRef.current) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        updateTransform({ x: pan.x + dx, y: pan.y + dy }, zoom);
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (!draggingId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;

      const newX = Math.max(0, mouseX - dragOffset.x);
      const newY = Math.max(0, mouseY - dragOffset.y);

      setMachines((prev) =>
        prev.map((m) => (m.id === draggingId ? { ...m, x: Math.round(newX), y: Math.round(newY) } : m))
      );
      setHasUnsaved(true);
    },
    [draggingId, dragOffset, pan, zoom, isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Canvas background pan
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current && (e.target as HTMLElement).id !== 'canvas-grid') return;
    setSelectedId(null);
    if (e.button === 1 || e.altKey || e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(2.5, Math.max(0.35, zoom * zoomFactor));
    updateTransform(pan, newZoom);
  };

  // ---- Machine Quick Operations ----
  const handleQuickStatusChange = async (id: string, newStatus: CachedMachine['status']) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
    );
    branchStore.updateSingleMachine(branchId, id, { status: newStatus });

    // Persist immediately to Supabase
    await supabase.from('branch_machines').update({ status: newStatus }).eq('id', id);
  };

  const handleRotateMachine = async (id: string) => {
    const machine = machines.find((m) => m.id === id);
    if (!machine) return;
    const newRotation = (machine.rotation + 90) % 360;

    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, rotation: newRotation } : m))
    );
    branchStore.updateSingleMachine(branchId, id, { rotation: newRotation });
    setHasUnsaved(true);
  };

  const handleFocusMachine = (id: string) => {
    const machine = machines.find((m) => m.id === id);
    if (!machine || !canvasRef.current) return;
    setSelectedId(id);
    setActiveView('canvas');

    const rect = canvasRef.current.getBoundingClientRect();
    const targetX = rect.width / 2 - (machine.x + (machine.width || 120) / 2) * zoom;
    const targetY = rect.height / 2 - (machine.y + (machine.height || 80) / 2) * zoom;
    updateTransform({ x: targetX, y: targetY }, zoom);
  };

  const handleDeleteMachine = async (id: string) => {
    if (!confirm('Are you sure you want to remove this machinery?')) return;
    setMachines((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
    branchStore.updateMachines(branchId, machines.filter((m) => m.id !== id));

    await supabase.from('branch_machines').delete().eq('id', id);
  };

  // ---- Spawn Preset Machinery ----
  const handleQuickAddPreset = async (presetType: string) => {
    if (!branch) return;
    const preset = getPresetForType(presetType);
    const count = machines.filter((m) => m.machine_type === presetType).length;
    const label = `${preset.label.split(' ')[0]} 0${count + 1}`;

    const newMachine = {
      branch_id: branch.id,
      label,
      machine_type: preset.type,
      x: 100 + (machines.length * 30) % 400,
      y: 100 + (machines.length * 20) % 300,
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      rotation: 0,
      status: 'running' as const,
      config_json: {
        accent_color: preset.color,
        icon_name: preset.iconName,
        rated_power_kw: preset.specs.rated_power_kw,
        nominal_temp_c: preset.specs.nominal_temp_c,
        max_temp_c: preset.specs.max_temp_c,
        nominal_pressure_bar: preset.specs.nominal_pressure_bar,
        max_pressure_bar: preset.specs.max_pressure_bar,
        nominal_vib_mm_s: preset.specs.nominal_vib_mm_s,
        current_telemetry: {
          temperature_c: preset.specs.nominal_temp_c,
          power_kw: preset.specs.rated_power_kw,
          pressure_bar: preset.specs.nominal_pressure_bar,
          vibration_mm_s: preset.specs.nominal_vib_mm_s,
          efficiency: 0.96,
          timestamp: new Date().toISOString(),
        },
      },
    };

    const { data, error } = await supabase.from('branch_machines').insert(newMachine).select().single();
    if (!error && data) {
      setMachines((prev) => [...prev, data]);
      setSelectedId(data.id);
      branchStore.updateMachines(branchId, [...machines, data]);
    }
  };

  // ---- Spawn Custom Machinery from Modal ----
  const handleCreateCustomMachine = async (config: {
    label: string;
    machine_type: string;
    width: number;
    height: number;
    config_json: Record<string, any>;
  }) => {
    if (!branch) return;

    const newMachine = {
      branch_id: branch.id,
      label: config.label,
      machine_type: config.machine_type,
      x: 120 + (machines.length * 30) % 400,
      y: 120 + (machines.length * 25) % 300,
      width: config.width,
      height: config.height,
      rotation: 0,
      status: 'running' as const,
      config_json: config.config_json,
    };

    const { data, error } = await supabase.from('branch_machines').insert(newMachine).select().single();
    if (!error && data) {
      setMachines((prev) => [...prev, data]);
      setSelectedId(data.id);
      branchStore.updateMachines(branchId, [...machines, data]);
    }
  };

  // ---- Save Layout Coordinates ----
  const handleSaveLayout = async () => {
    if (!branch || saving) return;
    setSaving(true);
    try {
      await Promise.all(
        machines.map((m) =>
          supabase
            .from('branch_machines')
            .update({
              x: m.x,
              y: m.y,
              rotation: m.rotation,
              width: m.width,
              height: m.height,
              config_json: m.config_json,
            })
            .eq('id', m.id)
        )
      );
      setHasUnsaved(false);
      branchStore.updateMachines(branchId, machines);
    } catch (err) {
      console.error('Failed to save machine positions:', err);
    } finally {
      setSaving(false);
    }
  };

  // ---- Initial First-Time Loading Spinner Only ----
  if (loading && !branch) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-xs text-slate-400">Loading branch floor plan...</span>
      </div>
    );
  }

  if (!org || !branch) return null;

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden select-none" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* 1. Branch Side Navigation */}
      <BranchSideNav
        org={org}
        branch={branch}
        machines={machines}
        selectedId={selectedId}
        activeView={activeView}
        onSelectView={setActiveView}
        onSelectMachine={setSelectedId}
        onFocusMachine={handleFocusMachine}
        onQuickStatusChange={handleQuickStatusChange}
        onRotateMachine={handleRotateMachine}
        onDeleteMachine={handleDeleteMachine}
        onOpenCustomModal={() => setShowCustomModal(true)}
        onQuickAddPreset={handleQuickAddPreset}
      />

      {/* 2. Main Workspace: Floor Plan Canvas OR Telemetry HUD */}
      {activeView === 'telemetry' ? (
        <BranchTelemetryView
          org={org}
          branch={branch}
          machines={machines}
          onFocusMachineOnMap={(id) => {
            setActiveView('canvas');
            setTimeout(() => handleFocusMachine(id), 50);
          }}
        />
      ) : (
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Top Office-System Aggregate Statistics HUD */}
          <OfficeStatsBar
            machines={machines}
            zoom={zoom}
            hasUnsaved={hasUnsaved}
            saving={saving}
            isRealtimeConnected={isRealtimeConnected}
            onZoomIn={() => updateTransform(pan, Math.min(2.5, zoom + 0.15))}
            onZoomOut={() => updateTransform(pan, Math.max(0.35, zoom - 0.15))}
            onResetZoom={() => updateTransform(pan, 1.0)}
            onSave={handleSaveLayout}
            onOpenAddModal={() => setShowCustomModal(true)}
          />

          {/* Interactive Infinite Canvas */}
          <div
            ref={canvasRef}
            id="canvas-grid"
            className="w-full h-full cursor-crosshair overflow-hidden relative"
            style={{
              backgroundColor: branch.bg_color || '#f8fafc',
              backgroundImage:
                'radial-gradient(circle, rgba(148, 163, 184, 0.28) 1.2px, transparent 1.2px)',
              backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
            onMouseDown={handleCanvasMouseDown}
            onWheel={handleWheel}
          >
            {/* Floor Plan World Container */}
            <div
              className="absolute origin-top-left transition-transform duration-75"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: `${branch.canvas_w || 1600}px`,
                height: `${branch.canvas_h || 1000}px`,
              }}
            >
              {/* Floor boundary guide border */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-dashed"
                style={{ borderColor: 'rgba(148, 163, 184, 0.45)' }}
              >
                <span className="absolute top-2 left-3 text-[11px] font-mono text-slate-400">
                  {branch.name} — {branch.canvas_w}×{branch.canvas_h}px
                </span>
              </div>

              {/* Machinery Nodes on Floor Plan */}
              {machines.map((machine) => (
                <MachineNode
                  key={machine.id}
                  machine={machine}
                  isSelected={selectedId === machine.id}
                  orgSlug={orgSlug}
                  branchId={branchId}
                  onMouseDown={handleMouseDownNode}
                  onQuickStatusChange={handleQuickStatusChange}
                  onRotate={handleRotateMachine}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Custom Machine Creator Modal */}
      <CustomMachineModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onCreate={handleCreateCustomMachine}
      />
    </div>
  );
}
