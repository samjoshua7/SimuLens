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
import { ResourceGridOverlay, ResourceType } from '@/components/canvas/ResourceGridOverlay';
import { MachineSimulationPopup } from '@/components/canvas/MachineSimulationPopup';

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

  // Live Auto-Run Simulation Engine loop state
  const [isAutoSimulating, setIsAutoSimulating] = useState(true);
  const isAutoSimulatingRef = useRef(true);
  isAutoSimulatingRef.current = isAutoSimulating;

  // Active view
  const [activeView, setActiveView] = useState<BranchViewMode>('canvas');

  // Drag and selection state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // In-Place Simulation Popup Card state
  const [simulationPopupMachineId, setSimulationPopupMachineId] = useState<string | null>(null);

  // Resource Pipeline Grid overlay state
  const [showPipes, setShowPipes] = useState(true);
  const [activeResourceFilter, setActiveResourceFilter] = useState<ResourceType>('all');

  // Custom machine creation modal & Click-to-place mode
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [placingPresetType, setPlacingPresetType] = useState<string | null>(null);

  // Canvas pan / zoom (cached)
  const initialTransform = branchStore.getTransform(branchId);
  const [pan, setPan] = useState(initialTransform.pan);
  const [zoom, setZoom] = useState(initialTransform.zoom);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Spacebar Pan Navigation (Figma/CAD style)
  const [isSpacebarDown, setIsSpacebarDown] = useState(false);
  const isSpacebarDownRef = useRef(false);

  // Mutable refs to eliminate stale closures during drag/pan/zoom
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const isPanningRef = useRef(isPanning);
  isPanningRef.current = isPanning;
  const panStartRef = useRef(panStart);
  panStartRef.current = panStart;

  const machinesRef = useRef(machines);
  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  const draggingRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Update store when pan/zoom changes
  const updateTransform = useCallback((newPan: { x: number; y: number }, newZoom: number) => {
    setPan(newPan);
    setZoom(newZoom);
    panRef.current = newPan;
    zoomRef.current = newZoom;
    branchStore.setTransform(branchId, newPan, newZoom);
  }, [branchId]);

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
      // Do not overwrite coordinates if a machine is currently being dragged
      if (!draggingRef.current) {
        setMachines(loadedMachines);
        branchStore.set(branchId, orgData, branchData, loadedMachines);
      }
    } catch (err) {
      console.error('Error fetching branch data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, orgSlug, branchId, router]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Single persistent Supabase Realtime channel & debounced DB writer
  const channelRef = useRef<any>(null);
  const dbSaveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Canvas DOM Node reference for guaranteed non-passive listener attachment
  const canvasNodeRef = useRef<HTMLDivElement | null>(null);

  // ---- Trackpad Two-Finger Pinch-to-Zoom & Pan (Non-Passive Wheel Listener) ----
  const canvasCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Remove old listener if node changed
      if (canvasNodeRef.current && (canvasNodeRef.current as any)._wheelHandler) {
        canvasNodeRef.current.removeEventListener('wheel', (canvasNodeRef.current as any)._wheelHandler);
        delete (canvasNodeRef.current as any)._wheelHandler;
      }

      canvasNodeRef.current = node;
      (canvasRef as any).current = node;
      if (!node) return;

      const handleCanvasWheelNative = (e: WheelEvent) => {
        // Prevent browser native whole-document zoom and outer scroll
        e.preventDefault();
        e.stopPropagation();

        const rect = node.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        if (e.ctrlKey || e.metaKey) {
          // Trackpad pinch-to-zoom or Ctrl+Wheel
          const zoomFactor = Math.exp(-e.deltaY * 0.008);
          const currentZoom = zoomRef.current;
          const newZoom = Math.min(2.5, Math.max(0.35, currentZoom * zoomFactor));

          // Smooth zoom focused directly on mouse pointer
          const newPanX = cursorX - (cursorX - panRef.current.x) * (newZoom / currentZoom);
          const newPanY = cursorY - (cursorY - panRef.current.y) * (newZoom / currentZoom);

          updateTransform({ x: newPanX, y: newPanY }, newZoom);
        } else {
          // Two-finger trackpad scroll or regular mouse wheel: smooth pan
          const newPanX = panRef.current.x - e.deltaX;
          const newPanY = panRef.current.y - e.deltaY;
          updateTransform({ x: newPanX, y: newPanY }, zoomRef.current);
        }
      };

      (node as any)._wheelHandler = handleCanvasWheelNative;
      node.addEventListener('wheel', handleCanvasWheelNative, { passive: false });
    },
    [updateTransform]
  );

  // ---- Realtime & Multi-Screen Synchronization (Single Persistent Channel) ----
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase.channel(`branch_sync_${branchId}`);
    channelRef.current = channel;

    channel
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
            // Skip updating position if user is actively dragging this machine
            if (draggingRef.current?.id === updated.id) return;
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
                  primary_resource: telemetry.primary_resource || m.config_json?.primary_resource,
                  resource_rate: telemetry.resource_rate ?? m.config_json?.resource_rate,
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
      // 3. Listen for batch telemetry broadcasts from peer auto-simulation
      .on('broadcast', { event: 'branch_telemetry_batch' }, (event) => {
        const { machines: batchMachines } = event.payload || {};
        if (Array.isArray(batchMachines) && batchMachines.length > 0) {
          setMachines((prev) => {
            const idMap = new Map(batchMachines.map((bm: any) => [bm.id, bm]));
            const next = prev.map((m) => {
              const update = idMap.get(m.id);
              if (!update) return m;
              return {
                ...m,
                status: update.status || m.status,
                config_json: {
                  ...m.config_json,
                  primary_resource: update.telemetry?.primary_resource || m.config_json?.primary_resource,
                  resource_rate: update.telemetry?.resource_rate ?? m.config_json?.resource_rate,
                  current_telemetry: {
                    ...m.config_json?.current_telemetry,
                    ...update.telemetry,
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

    // Gentle 5-second background poller as fallback
    const interval = setInterval(() => {
      if (!draggingRef.current && !isPanningRef.current) {
        fetchData(false);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(interval);
    };
  }, [branchId, fetchData]);

  // ---- Calibrated Gaussian Noise Generator (Box-Muller Transform) ----
  const gaussianNoise = useCallback((mean = 0, stdev = 1): number => {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }, []);

  // ---- Realtime Stochastic ODE Physics Stepper ----
  const stepMachinePhysics = useCallback(
    (machine: CachedMachine, dt = 1.5): Record<string, any> => {
      const cfg = machine.config_json || {};
      const current = cfg.current_telemetry || {};
      const isOffline = machine.status === 'offline';
      const isIdle = machine.status === 'idle';

      const nominalTemp = Number(cfg.nominal_temp_c) || 68.0;
      const maxTemp = Number(cfg.max_temp_c) || 95.0;
      const ratedPower = Number(cfg.rated_power_kw) || 45.0;
      const nominalPressure = Number(cfg.nominal_pressure_bar) || 4.2;
      const nominalVib = Number(cfg.nominal_vib_mm_s) || 1.8;
      const baseResourceRate =
        Number(cfg.resource_rate) || (cfg.primary_resource === 'electricity' ? ratedPower : 12.0);

      let temp = Number(current.temperature_c ?? nominalTemp);
      let power = Number(current.power_kw ?? ratedPower);
      let pressure = Number(current.pressure_bar ?? nominalPressure);
      let vib = Number(current.vibration_mm_s ?? nominalVib);
      let resourceRate = Number(current.resource_rate ?? baseResourceRate);
      let efficiency = Number(current.efficiency ?? 0.95);

      if (isOffline) {
        // Machine off: Ambient decay towards 25°C
        temp = temp + (25.0 - temp) * 0.08 + gaussianNoise(0, 0.1);
        power = Math.max(0, gaussianNoise(0.2, 0.05));
        pressure = Math.max(1.0, pressure * 0.9 + gaussianNoise(0, 0.05));
        vib = Math.max(0, gaussianNoise(0.04, 0.02));
        resourceRate = 0;
        efficiency = 0;
      } else if (isIdle) {
        // Machine idling / standby
        const idleTemp = nominalTemp * 0.6;
        temp = temp + (idleTemp - temp) * 0.05 + gaussianNoise(0, 0.2);
        power = ratedPower * 0.15 + gaussianNoise(0, 0.5);
        pressure = nominalPressure * 0.5 + gaussianNoise(0, 0.1);
        vib = nominalVib * 0.3 + Math.abs(gaussianNoise(0, 0.05));
        resourceRate = baseResourceRate * 0.15;
        efficiency = 0.5;
      } else {
        // Running machine: Dynamic thermal relaxation + Gaussian diffusion (Euler-Maruyama)
        const tau = 25.0; // thermal time constant in seconds
        const tempTarget = nominalTemp + (power / ratedPower - 1.0) * 12.0;
        const dTemp = (dt / tau) * (tempTarget - temp) + gaussianNoise(0, 0.35);
        temp = Math.max(20, Math.min(maxTemp + 15, temp + dTemp));

        // Power draw fluctuates around nominal with thermal coupling
        const tempRatio = temp / nominalTemp;
        const powerTarget = ratedPower * Math.pow(Math.max(0.2, tempRatio), 0.3);
        power = Math.max(1.0, powerTarget + gaussianNoise(0, ratedPower * 0.025));

        // Pressure tracks temperature and flow
        const pressureTarget = nominalPressure * (1 + (temp - nominalTemp) * 0.005);
        pressure = Math.max(0.5, pressureTarget + gaussianNoise(0, nominalPressure * 0.02));

        // Vibration increases non-linearly with thermal stress
        const thermalStress = Math.max(0, (temp - nominalTemp) / 10);
        const vibTarget = nominalVib * (1 + 0.08 * thermalStress);
        vib = Math.max(0.1, vibTarget + Math.abs(gaussianNoise(0, 0.08)));

        // Resource consumption tracks power load
        resourceRate = Math.max(0, (power / ratedPower) * baseResourceRate + gaussianNoise(0, 0.2));

        // Efficiency degrades slightly with higher temp / vibration
        efficiency = Math.max(
          0.7,
          Math.min(
            0.99,
            0.96 - 0.01 * thermalStress - (vib / nominalVib - 1) * 0.02 + gaussianNoise(0, 0.005)
          )
        );
      }

      // Check dynamic warning / critical status
      let nextStatus = machine.status;
      if (!isOffline && !isIdle) {
        if (temp >= maxTemp + 8 || vib > nominalVib * 2.8) {
          nextStatus = 'critical';
        } else if (temp >= maxTemp || vib > nominalVib * 2.0) {
          nextStatus = 'warning';
        } else {
          nextStatus = 'running';
        }
      }

      return {
        temperature_c: Math.round(temp * 10) / 10,
        power_kw: Math.round(power * 10) / 10,
        pressure_bar: Math.round(pressure * 100) / 100,
        vibration_mm_s: Math.round(vib * 100) / 100,
        resource_rate: Math.round(resourceRate * 10) / 10,
        primary_resource: cfg.primary_resource || 'electricity',
        efficiency: Math.round(efficiency * 1000) / 1000,
        timestamp: new Date().toISOString(),
        status: nextStatus,
      };
    },
    [gaussianNoise]
  );

  // ---- Background Physics Auto-Run Loop (Breathing ODE Telemetry every 1.5s) ----
  useEffect(() => {
    if (!isAutoSimulating || !branchId) return;

    const interval = setInterval(() => {
      // Pause updates if user is actively dragging a machinery node
      if (draggingRef.current) return;

      setMachines((prev) => {
        if (prev.length === 0) return prev;

        const updated = prev.map((machine) => {
          const newTelemetry = stepMachinePhysics(machine, 1.5);
          return {
            ...machine,
            status: newTelemetry.status || machine.status,
            config_json: {
              ...machine.config_json,
              primary_resource: newTelemetry.primary_resource,
              resource_rate: newTelemetry.resource_rate,
              current_telemetry: newTelemetry,
            },
          };
        });

        // Update in-memory store
        branchStore.updateMachines(branchId, updated);

        // Broadcast batch telemetry to other screens (e.g. PC2)
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'branch_telemetry_batch',
            payload: {
              branch_id: branchId,
              machines: updated.map((m) => ({
                id: m.id,
                status: m.status,
                telemetry: m.config_json.current_telemetry,
              })),
            },
          });
        }

        return updated;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isAutoSimulating, branchId, stepMachinePhysics]);

  // ---- Spacebar Key Listener for Map Navigation ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        if (!isSpacebarDownRef.current) {
          isSpacebarDownRef.current = true;
          setIsSpacebarDown(true);
        }
      } else if (e.code === 'Escape') {
        setPlacingPresetType(null);
        setSelectedId(null);
        setSimulationPopupMachineId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacebarDownRef.current = false;
        setIsSpacebarDown(false);
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ---- Drag & Position Handlers with Auto-Save on Drop ----
  const handleMouseDownNode = (e: React.MouseEvent, machineId: string) => {
    // If Spacebar is down, ignore node click and let Spacebar pan handle it
    if (isSpacebarDownRef.current) return;

    e.stopPropagation();
    e.preventDefault();
    const machine = machinesRef.current.find((m) => m.id === machineId);
    if (!machine || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const mouseY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    const offsetX = mouseX - machine.x;
    const offsetY = mouseY - machine.y;

    draggingRef.current = {
      id: machineId,
      offsetX,
      offsetY,
      currentX: machine.x,
      currentY: machine.y,
    };

    setDraggingId(machineId);
    setSelectedId(machineId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // 1. Panning canvas (Spacebar held or middle click)
    if (isPanningRef.current && canvasRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      setPanStart({ x: e.clientX, y: e.clientY });
      updateTransform({ x: panRef.current.x + dx, y: panRef.current.y + dy }, zoomRef.current);
      return;
    }

    // 2. Dragging a machinery node
    const dragInfo = draggingRef.current;
    if (dragInfo && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const mouseY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

      // Snap to 10px grid with clamped boundary checking
      const rawX = Math.max(10, mouseX - dragInfo.offsetX);
      const rawY = Math.max(10, mouseY - dragInfo.offsetY);
      const snappedX = Math.round(rawX / 10) * 10;
      const snappedY = Math.round(rawY / 10) * 10;

      dragInfo.currentX = snappedX;
      dragInfo.currentY = snappedY;

      setMachines((prev) =>
        prev.map((m) => (m.id === dragInfo.id ? { ...m, x: snappedX, y: snappedY } : m))
      );
      setHasUnsaved(true);
    }
  }, [updateTransform]);

  const handleMouseUp = useCallback(() => {
    const dragInfo = draggingRef.current;
    if (dragInfo) {
      const finalX = dragInfo.currentX;
      const finalY = dragInfo.currentY;
      const machineId = dragInfo.id;
      draggingRef.current = null;
      setDraggingId(null);

      // Auto-save dropped machine position immediately to Supabase and store
      branchStore.updateSingleMachine(branchId, machineId, { x: finalX, y: finalY });
      supabase
        .from('branch_machines')
        .update({ x: finalX, y: finalY })
        .eq('id', machineId)
        .then();
    }

    isPanningRef.current = false;
    setIsPanning(false);
  }, [branchId]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Canvas background click (Pan or Click-to-Place)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Click-to-place mode
    if (placingPresetType && canvasNodeRef.current) {
      const rect = canvasNodeRef.current.getBoundingClientRect();
      const clickX = Math.round(((e.clientX - rect.left - panRef.current.x) / zoomRef.current) / 10) * 10;
      const clickY = Math.round(((e.clientY - rect.top - panRef.current.y) / zoomRef.current) / 10) * 10;
      handlePlaceAtCoords(placingPresetType, clickX, clickY);
      setPlacingPresetType(null);
      return;
    }

    // Check if clicked directly on an interactive machine node
    const targetEl = e.target as HTMLElement;
    const isTargetMachine = targetEl.closest('[id^="machine-node-"]');

    // Spacebar held, middle mouse button (1), Alt key, or background click
    if (isSpacebarDownRef.current || e.button === 1 || e.altKey || !isTargetMachine) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });

      if (!isTargetMachine && !isSpacebarDownRef.current) {
        setSelectedId(null);
      }
    }
  };

  // HTML5 Drag-and-Drop from Equipment Palette directly onto Floor Plan
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const presetType = e.dataTransfer.getData('text/plain');
    if (!presetType || !canvasNodeRef.current) return;

    const rect = canvasNodeRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const mouseY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    const preset = getPresetForType(presetType);
    const snappedX = Math.round(Math.max(10, mouseX - preset.defaultWidth / 2) / 10) * 10;
    const snappedY = Math.round(Math.max(10, mouseY - preset.defaultHeight / 2) / 10) * 10;

    handlePlaceAtCoords(presetType, snappedX, snappedY);
  };

  // Precision Coordinate Update from Sidebar Inspector
  const handleUpdateMachinePosition = async (id: string, x: number, y: number) => {
    setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
    branchStore.updateSingleMachine(branchId, id, { x, y });
    await supabase.from('branch_machines').update({ x, y }).eq('id', id);
  };

  // ---- Machine Quick Operations ----
  const handleQuickStatusChange = async (id: string, newStatus: CachedMachine['status']) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
    );
    branchStore.updateSingleMachine(branchId, id, { status: newStatus });
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
    await supabase.from('branch_machines').update({ rotation: newRotation }).eq('id', id);
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
    if (simulationPopupMachineId === id) setSimulationPopupMachineId(null);
    branchStore.updateMachines(branchId, machines.filter((m) => m.id !== id));

    await supabase.from('branch_machines').delete().eq('id', id);
  };

  // ---- Spawn Preset Machinery at Exact Coordinates ----
  const handlePlaceAtCoords = async (presetType: string, x: number, y: number) => {
    if (!branch) return;
    const preset = getPresetForType(presetType);
    const count = machines.filter((m) => m.machine_type === presetType).length;
    const label = `${preset.label.split(' ')[0]} 0${count + 1}`;

    const newMachine = {
      branch_id: branch.id,
      label,
      machine_type: preset.type,
      x: Math.max(10, x),
      y: Math.max(10, y),
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      rotation: 0,
      status: 'running' as const,
      config_json: {
        accent_color: preset.color,
        icon_name: preset.iconName,
        primary_resource: preset.type === 'boiler' ? 'diesel' : preset.type === 'chiller' ? 'hydrogen' : 'electricity',
        resource_rate: 14.5,
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

  const handleQuickAddPreset = (presetType: string) => {
    // Offset spawn
    const spawnX = 140 + (machines.length * 40) % 450;
    const spawnY = 120 + (machines.length * 30) % 350;
    handlePlaceAtCoords(presetType, spawnX, spawnY);
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
      x: 150 + (machines.length * 30) % 400,
      y: 130 + (machines.length * 25) % 300,
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

  // ---- Save All Layout Positions ----
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

  // Telemetry update from In-Place Simulation Popup (Zero-latency broadcast + 500ms debounced DB save)
  const handlePopupTelemetryUpdate = (
    machineId: string,
    telemetry: Record<string, any>,
    status?: CachedMachine['status']
  ) => {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
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
        };
      })
    );

    branchStore.updateSingleMachineTelemetry(branchId, machineId, telemetry, status);

    // Broadcast over persistent channel immediately for zero latency
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'telemetry_sync',
        payload: {
          machine_id: machineId,
          status: status || 'running',
          telemetry,
        },
      });
    }

    // Debounce DB persistence by 500ms to eliminate PostgreSQL load spikes during slider drag
    if (dbSaveTimeoutRef.current[machineId]) {
      clearTimeout(dbSaveTimeoutRef.current[machineId]);
    }
    dbSaveTimeoutRef.current[machineId] = setTimeout(async () => {
      try {
        const currentMachine = machinesRef.current.find((m) => m.id === machineId);
        await supabase
          .from('branch_machines')
          .update({
            status: status || currentMachine?.status || 'running',
            config_json: {
              ...(currentMachine?.config_json || {}),
              primary_resource: telemetry.primary_resource,
              resource_rate: telemetry.resource_rate,
              current_telemetry: {
                ...telemetry,
                timestamp: new Date().toISOString(),
              },
            },
          })
          .eq('id', machineId);
      } catch (err) {
        console.error('Failed to persist telemetry update to Supabase:', err);
      }
    }, 500);
  };

  const popupMachine = machines.find((m) => m.id === simulationPopupMachineId) || null;

  // Initial loading only
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
        onStartPlacingPreset={(type) => setPlacingPresetType(type)}
        onUpdateMachinePosition={handleUpdateMachinePosition}
        onOpenSimulationPopup={(id) => setSimulationPopupMachineId(id)}
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
            orgSlug={orgSlug}
            branchId={branchId}
            machines={machines}
            zoom={zoom}
            hasUnsaved={hasUnsaved}
            saving={saving}
            isRealtimeConnected={isRealtimeConnected}
            showPipes={showPipes}
            activeResourceFilter={activeResourceFilter}
            isAutoSimulating={isAutoSimulating}
            onToggleAutoSimulating={() => setIsAutoSimulating((prev) => !prev)}
            onTogglePipes={() => setShowPipes(!showPipes)}
            onSelectResourceFilter={setActiveResourceFilter}
            onZoomIn={() => updateTransform(pan, Math.min(2.5, zoom + 0.15))}
            onZoomOut={() => updateTransform(pan, Math.max(0.35, zoom - 0.15))}
            onResetZoom={() => updateTransform(pan, 1.0)}
            onSave={handleSaveLayout}
            onOpenAddModal={() => setShowCustomModal(true)}
          />

          {/* Placement Target Mode Floating Notification */}
          {placingPresetType && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-xs shadow-2xl flex items-center gap-3 animate-pulse border border-white/20">
              <span>🎯 Click anywhere on the floor plan to place <b>{getPresetForType(placingPresetType).label}</b></span>
              <button
                onClick={() => setPlacingPresetType(null)}
                className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px] uppercase font-bold"
              >
                Cancel (Esc)
              </button>
            </div>
          )}

          {/* Interactive Infinite Canvas */}
          <div
            ref={canvasCallbackRef}
            id="canvas-grid"
            className={`w-full h-full overflow-hidden relative select-none ${
              isSpacebarDown
                ? isPanning
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : placingPresetType
                ? 'cursor-crosshair'
                : isPanning
                ? 'cursor-grabbing'
                : 'cursor-default'
            }`}
            style={{
              touchAction: 'none',
              backgroundColor: branch.bg_color || '#f8fafc',
              backgroundImage:
                'radial-gradient(circle, rgba(148, 163, 184, 0.28) 1.2px, transparent 1.2px)',
              backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
            onMouseDown={handleCanvasMouseDown}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
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

              {/* Animated Power Lines & Multi-Resource Supply Grid */}
              <ResourceGridOverlay
                machines={machines}
                canvasWidth={branch.canvas_w || 1600}
                canvasHeight={branch.canvas_h || 1000}
                showPipes={showPipes}
                activeFilter={activeResourceFilter}
              />

              {/* Machinery Nodes on Floor Plan */}
              {machines.map((machine) => (
                <MachineNode
                  key={machine.id}
                  machine={machine}
                  isSelected={selectedId === machine.id}
                  isDragging={draggingId === machine.id}
                  anyDragging={!!draggingId}
                  isSpacebarDown={isSpacebarDown}
                  orgSlug={orgSlug}
                  branchId={branchId}
                  onMouseDown={handleMouseDownNode}
                  onQuickStatusChange={handleQuickStatusChange}
                  onRotate={handleRotateMachine}
                  onOpenSimulationPopup={(id) => setSimulationPopupMachineId(id)}
                />
              ))}
            </div>
          </div>

          {/* In-Place Simulation & Resource Control Popup Card */}
          {popupMachine && (
            <MachineSimulationPopup
              machine={popupMachine}
              orgSlug={orgSlug}
              branchId={branchId}
              onClose={() => setSimulationPopupMachineId(null)}
              onTelemetryUpdate={handlePopupTelemetryUpdate}
            />
          )}
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
