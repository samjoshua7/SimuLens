import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryBuffer } from '../telemetryBuffer.js';

test('TelemetryRingBuffer - Records samples and maintains window', () => {
  telemetryBuffer.clearBuffer('test-m1');

  const baseTime = Date.now();
  // Record 10 rising temperature points (rising 2 deg C per minute)
  for (let i = 0; i < 10; i++) {
    telemetryBuffer.recordSample('test-m1', {
      timestamp: baseTime + i * 10000, // 10s intervals
      state: {
        temperature_c: 60 + i * (2 / 6), // 2 deg per 60s
        pressure_bar: 4.0,
        power_kw: 20,
        vibration_mm_s: 1.5,
        cooling_efficiency: 0.95,
      },
      action: { machine_load: 75, fan_speed: 60, coolant_flow: 50 },
    });
  }

  const window = telemetryBuffer.getWindow('test-m1', 5);
  assert.equal(window.length, 5);

  const latest = telemetryBuffer.getLatest('test-m1');
  assert.ok(latest);
  assert.ok(latest.state.temperature_c > 62);

  // Slope should be approx 2.0 C/min
  const slope = telemetryBuffer.calculateSlope('test-m1', 'temperature_c', 120);
  assert.ok(slope.slopePerMin >= 1.8 && slope.slopePerMin <= 2.2, `Slope was ${slope.slopePerMin}`);
  assert.ok(slope.r2 > 0.95, `R2 was ${slope.r2}`);

  // Time to 75 deg C limit from ~63 deg C at 2 C/min should be ~6 minutes
  const ttl = telemetryBuffer.estimateTimeToLimit('test-m1', 'temperature_c', 75, 120);
  assert.ok(ttl !== null);
  assert.ok(ttl >= 5.0 && ttl <= 7.0, `TTL was ${ttl}`);
});
