import {
  PredictionEnvelope,
  TelemetryStep,
  ValidationSummary,
  ValidationComparison,
  SystemState
} from '@simulens/shared';

type StateMetricKey = 'temperature_c' | 'pressure_bar' | 'power_kw' | 'vibration_mm_s' | 'cooling_efficiency';

export class ValidationEngine {
  /**
   * Evaluates prediction envelope against actual simulator ground truth trajectory
   */
  static evaluate(
    prediction: PredictionEnvelope,
    actualTrajectory: TelemetryStep[]
  ): ValidationSummary {
    const comparisons: ValidationComparison[] = [];
    const keys: StateMetricKey[] = [
      'temperature_c',
      'pressure_bar',
      'power_kw',
      'vibration_mm_s',
      'cooling_efficiency',
    ];

    const errorSums: Record<StateMetricKey, number> = {
      temperature_c: 0,
      pressure_bar: 0,
      power_kw: 0,
      vibration_mm_s: 0,
      cooling_efficiency: 0,
    };
    const sqErrorSums: Record<StateMetricKey, number> = {
      temperature_c: 0,
      pressure_bar: 0,
      power_kw: 0,
      vibration_mm_s: 0,
      cooling_efficiency: 0,
    };
    const inIntervalSums: Record<StateMetricKey, number> = {
      temperature_c: 0,
      pressure_bar: 0,
      power_kw: 0,
      vibration_mm_s: 0,
      cooling_efficiency: 0,
    };
    const counts: Record<StateMetricKey, number> = {
      temperature_c: 0,
      pressure_bar: 0,
      power_kw: 0,
      vibration_mm_s: 0,
      cooling_efficiency: 0,
    };

    const compareSteps = Math.min(prediction.steps.length, actualTrajectory.length);

    for (let i = 0; i < compareSteps; i++) {
      const predStep = prediction.steps[i];
      const actStep = actualTrajectory[i];

      keys.forEach((k) => {
        const pVar = predStep.variables[k];
        const actualVal = actStep.state[k];
        const err = actualVal - pVar.mean;
        const in90 = actualVal >= pVar.lo_90 && actualVal <= pVar.hi_90;

        comparisons.push({
          horizon_step: predStep.step,
          variable: k,
          predicted_mean: pVar.mean,
          actual_value: actualVal,
          error: Number(err.toFixed(3)),
          lo_90: pVar.lo_90,
          hi_90: pVar.hi_90,
          in_interval_90: in90,
        });

        errorSums[k] += Math.abs(err);
        sqErrorSums[k] += err * err;
        if (in90) inIntervalSums[k] += 1;
        counts[k] += 1;
      });
    }

    const mae: Record<string, number> = {};
    const rmse: Record<string, number> = {};
    const picp_90: Record<string, number> = {};

    keys.forEach((k) => {
      const n = counts[k] || 1;
      mae[k] = Number((errorSums[k] / n).toFixed(3));
      rmse[k] = Number(Math.sqrt(sqErrorSums[k] / n).toFixed(3));
      picp_90[k] = Number((inIntervalSums[k] / n).toFixed(3));
    });

    return {
      mae,
      rmse,
      picp_90,
      comparisons,
    };
  }
}
