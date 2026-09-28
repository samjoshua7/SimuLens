// =============================================================================
// SimuLens — Branch In-Memory Cache Store
// Zero-flicker client cache: prevents full page reload when switching tabs or views
// =============================================================================

export interface CachedMachine {
  id: string;
  branch_id: string;
  label: string;
  machine_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  config_json: Record<string, any>;
  status: 'idle' | 'running' | 'warning' | 'critical' | 'offline';
  created_at: string;
}

export interface CachedBranch {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  canvas_w: number;
  canvas_h: number;
  bg_color: string;
}

export interface CachedOrg {
  id: string;
  name: string;
  slug: string;
}

interface BranchEntry {
  org: CachedOrg;
  branch: CachedBranch;
  machines: CachedMachine[];
  pan: { x: number; y: number };
  zoom: number;
  lastUpdated: number;
}

const memoryStore = new Map<string, BranchEntry>();

export const branchStore = {
  get(branchId: string): BranchEntry | null {
    return memoryStore.get(branchId) || null;
  },

  set(branchId: string, org: CachedOrg, branch: CachedBranch, machines: CachedMachine[]) {
    const existing = memoryStore.get(branchId);
    memoryStore.set(branchId, {
      org,
      branch,
      machines,
      pan: existing ? existing.pan : { x: 0, y: 0 },
      zoom: existing ? existing.zoom : 1,
      lastUpdated: Date.now(),
    });
  },

  updateMachines(branchId: string, machines: CachedMachine[]) {
    const existing = memoryStore.get(branchId);
    if (existing) {
      existing.machines = machines;
      existing.lastUpdated = Date.now();
    }
  },

  updateSingleMachine(branchId: string, machineId: string, partial: Partial<CachedMachine>) {
    const existing = memoryStore.get(branchId);
    if (existing) {
      existing.machines = existing.machines.map((m) =>
        m.id === machineId ? { ...m, ...partial } : m
      );
      existing.lastUpdated = Date.now();
    }
  },

  updateSingleMachineTelemetry(
    branchId: string,
    machineId: string,
    telemetry: Record<string, any>,
    status?: CachedMachine['status']
  ) {
    const existing = memoryStore.get(branchId);
    if (existing) {
      existing.machines = existing.machines.map((m) => {
        if (m.id !== machineId) return m;
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
      existing.lastUpdated = Date.now();
    }
  },

  setTransform(branchId: string, pan: { x: number; y: number }, zoom: number) {
    const existing = memoryStore.get(branchId);
    if (existing) {
      existing.pan = pan;
      existing.zoom = zoom;
    }
  },

  getTransform(branchId: string) {
    const existing = memoryStore.get(branchId);
    return existing ? { pan: existing.pan, zoom: existing.zoom } : { pan: { x: 0, y: 0 }, zoom: 1 };
  },

  has(branchId: string): boolean {
    return memoryStore.has(branchId);
  },
};
