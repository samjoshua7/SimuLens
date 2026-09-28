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
  telemetry?: Record<string, any>;
  config?: Record<string, any>;
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

export interface ResourcePoolsState {
  grid_online: boolean; // Main utility grid 415V status (true = ONLINE, false = OUTAGE)
  diesel_current_l: number;
  diesel_capacity_l: number;
  petrol_current_l: number;
  petrol_capacity_l: number;
  hydrogen_current_kg: number;
  hydrogen_capacity_kg: number;
  kerosene_current_l: number;
  kerosene_capacity_l: number;
  genset_auto_ats: boolean; // Automatic Transfer Switch (ATS) enabled
  lastRefillTimestamp: number;
}

export const DEFAULT_RESOURCE_POOLS: ResourcePoolsState = {
  grid_online: true,
  diesel_current_l: 850.0,
  diesel_capacity_l: 1000.0,
  petrol_current_l: 420.0,
  petrol_capacity_l: 500.0,
  hydrogen_current_kg: 160.0,
  hydrogen_capacity_kg: 200.0,
  kerosene_current_l: 680.0,
  kerosene_capacity_l: 800.0,
  genset_auto_ats: true,
  lastRefillTimestamp: Date.now(),
};

interface BranchEntry {
  org: CachedOrg;
  branch: CachedBranch;
  machines: CachedMachine[];
  pan: { x: number; y: number };
  zoom: number;
  resourcePools: ResourcePoolsState;
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
      resourcePools: existing?.resourcePools || { ...DEFAULT_RESOURCE_POOLS },
      lastUpdated: Date.now(),
    });
  },

  getResourcePools(branchId: string): ResourcePoolsState {
    const existing = memoryStore.get(branchId);
    return existing?.resourcePools || { ...DEFAULT_RESOURCE_POOLS };
  },

  updateResourcePools(branchId: string, partial: Partial<ResourcePoolsState>): ResourcePoolsState {
    const existing = memoryStore.get(branchId);
    if (existing) {
      existing.resourcePools = {
        ...existing.resourcePools,
        ...partial,
      };
      existing.lastUpdated = Date.now();
      return existing.resourcePools;
    }
    return { ...DEFAULT_RESOURCE_POOLS, ...partial };
  },

  refillAllPools(branchId: string): ResourcePoolsState {
    const existing = memoryStore.get(branchId);
    const refilled: ResourcePoolsState = {
      ...(existing?.resourcePools || DEFAULT_RESOURCE_POOLS),
      diesel_current_l: (existing?.resourcePools || DEFAULT_RESOURCE_POOLS).diesel_capacity_l,
      petrol_current_l: (existing?.resourcePools || DEFAULT_RESOURCE_POOLS).petrol_capacity_l,
      hydrogen_current_kg: (existing?.resourcePools || DEFAULT_RESOURCE_POOLS).hydrogen_capacity_kg,
      kerosene_current_l: (existing?.resourcePools || DEFAULT_RESOURCE_POOLS).kerosene_capacity_l,
      lastRefillTimestamp: Date.now(),
    };
    if (existing) {
      existing.resourcePools = refilled;
      existing.lastUpdated = Date.now();
    }
    return refilled;
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

// =============================================================================
// Organization List In-Memory Cache (Zero-flicker on tab switch)
// =============================================================================
let cachedOrgs: any[] | null = null;

export const orgStore = {
  get(): any[] | null {
    return cachedOrgs;
  },
  set(orgs: any[]) {
    cachedOrgs = orgs;
  },
  has(): boolean {
    return cachedOrgs !== null;
  },
  clear() {
    cachedOrgs = null;
  },
};

// =============================================================================
// Org Branches In-Memory Cache (Zero-flicker on tab switch)
// =============================================================================
const orgBranchesStore = new Map<string, { org: any; branches: any[] }>();

export const branchListStore = {
  get(orgSlug: string) {
    return orgBranchesStore.get(orgSlug) || null;
  },
  set(orgSlug: string, org: any, branches: any[]) {
    orgBranchesStore.set(orgSlug, { org, branches });
  },
  has(orgSlug: string): boolean {
    return orgBranchesStore.has(orgSlug);
  },
  clear() {
    orgBranchesStore.clear();
  },
};

