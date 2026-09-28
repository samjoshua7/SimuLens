import { SystemState, ControllableAction, EnvironmentCondition } from '@simulens/shared';

export interface TelemetryPoint {
  timestamp: number; // Unix ms
  state: SystemState;
  action: ControllableAction;
  environment?: EnvironmentCondition;
}

export interface SlopeResult {
  slopePerMin: number;
  r2: number;
  pointsCount: number;
  currentValue: number;
}

const MAX_SAMPLES_PER_MACHINE = 120;

class TelemetryRingBuffer {
  private buffers: Map<string, TelemetryPoint[]> = new Map();

  /**
   * Append a telemetry point to the machine's buffer, maintaining max length.
   */
  recordSample(
    machineId: string,
    sample: {
      timestamp?: number;
      state: SystemState;
      action: ControllableAction;
      environment?: EnvironmentCondition;
    }
  ): void {
    if (!this.buffers.has(machineId)) {
      this.buffers.set(machineId, []);
    }

    const buf = this.buffers.get(machineId)!;
    const point: TelemetryPoint = {
      timestamp: sample.timestamp ?? Date.now(),
      state: sample.state,
      action: sample.action,
      environment: sample.environment,
    };

    buf.push(point);
    if (buf.length > MAX_SAMPLES_PER_MACHINE) {
      buf.shift();
    }
  }

  /**
   * Get the last `n` samples for a given machine (default 30).
   */
  getWindow(machineId: string, n = 30): TelemetryPoint[] {
    const buf = this.buffers.get(machineId);
    if (!buf || buf.length === 0) return [];
    return buf.slice(-n);
  }

  /**
   * Get the most recent telemetry point for a machine.
   */
  getLatest(machineId: string): TelemetryPoint | null {
    const buf = this.buffers.get(machineId);
    if (!buf || buf.length === 0) return null;
    return buf[buf.length - 1];
  }

  /**
   * Calculate ordinary least squares (OLS) linear regression slope for a metric.
   * Returns slope per simulated/real minute.
   */
  calculateSlope(
    machineId: string,
    metric: keyof SystemState,
    windowSeconds = 60
  ): SlopeResult {
    const buf = this.buffers.get(machineId);
    if (!buf || buf.length < 3) {
      return { slopePerMin: 0, r2: 0, pointsCount: buf?.length ?? 0, currentValue: buf?.[buf.length - 1]?.state[metric] ?? 0 };
    }

    const now = buf[buf.length - 1].timestamp;
    const cutoff = now - windowSeconds * 1000;
    const points = buf.filter((p) => p.timestamp >= cutoff);

    if (points.length < 3) {
      return { slopePerMin: 0, r2: 0, pointsCount: points.length, currentValue: buf[buf.length - 1].state[metric] };
    }

    // Convert timestamps to relative minutes from first point in window
    const t0 = points[0].timestamp;
    const xs = points.map((p) => (p.timestamp - t0) / 60000); // in minutes
    const ys = points.map((p) => p.state[metric]);

    const n = xs.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
      sumXY += xs[i] * ys[i];
      sumX2 += xs[i] * xs[i];
      sumY2 += ys[i] * ys[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 1e-9) {
      return { slopePerMin: 0, r2: 0, pointsCount: n, currentValue: ys[ys.length - 1] };
    }

    const slopePerMin = (n * sumXY - sumX * sumY) / denominator;

    // Pearson R^2 correlation coefficient
    const numR = n * sumXY - sumX * sumY;
    const denR = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r2 = denR > 1e-9 ? Math.pow(numR / denR, 2) : 0;

    return {
      slopePerMin: Math.round(slopePerMin * 100) / 100,
      r2: Math.round(r2 * 100) / 100,
      pointsCount: n,
      currentValue: ys[ys.length - 1],
    };
  }

  /**
   * Estimate minutes until metric reaches a critical upper or lower limit.
   * Returns null if moving away from limit or slope is zero / noisy (r2 < 0.4).
   */
  estimateTimeToLimit(
    machineId: string,
    metric: keyof SystemState,
    limit: number,
    windowSeconds = 60
  ): number | null {
    const { slopePerMin, r2, currentValue } = this.calculateSlope(machineId, metric, windowSeconds);

    // If already at or beyond limit
    if (currentValue >= limit) {
      return 0;
    }

    // Must be rising toward limit with reasonable linear fit
    if (slopePerMin <= 0.05 || r2 < 0.35) {
      return null;
    }

    const delta = limit - currentValue;
    const minutes = delta / slopePerMin;

    // Filter out absurdly distant projections (> 120 minutes)
    if (minutes > 120 || minutes < 0) {
      return null;
    }

    return Math.round(minutes * 10) / 10;
  }

  /**
   * Reset buffers
   */
  clearBuffer(machineId?: string): void {
    if (machineId) {
      this.buffers.delete(machineId);
    } else {
      this.buffers.clear();
    }
  }
}

export const telemetryBuffer = new TelemetryRingBuffer();
