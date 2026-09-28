import { VariableEnvelope, PredictionStepEnvelope, COOLING_SYSTEM_CONSTANTS } from '@simulens/shared';
import { OperatingRegionAssessment } from '@simulens/world-model';

export class UncertaintyEngine {
  /**
   * Constructs calibrated prediction envelope for a single variable at step h
   */
  static buildVariableEnvelope(
    mean: number,
    baseAleatoricStd: number,
    epistemicMultiplier: number,
    horizonStep: number
  ): VariableEnvelope {
    // Horizon compounding for multi-step drift
    const horizonFactor = Math.sqrt(horizonStep);
    const aleatoric_std = Number((baseAleatoricStd * horizonFactor).toFixed(3));
    const epistemic_std = Number((baseAleatoricStd * (epistemicMultiplier - 1.0) * horizonFactor * 1.2).toFixed(3));
    
    // Total variance = aleatoric^2 + epistemic^2
    const totalVariance = aleatoric_std * aleatoric_std + epistemic_std * epistemic_std;
    const std = Number(Math.sqrt(totalVariance).toFixed(3));

    // Standard Gaussian quantiles (z-scores)
    // 50% CI: z = 0.67449
    // 80% CI: z = 1.28155
    // 90% CI: z = 1.64485
    // 95% CI: z = 1.95996
    return {
      mean: Number(mean.toFixed(2)),
      std,
      aleatoric_std,
      epistemic_std,
      lo_50: Number((mean - 0.6745 * std).toFixed(2)),
      hi_50: Number((mean + 0.6745 * std).toFixed(2)),
      lo_80: Number((mean - 1.2816 * std).toFixed(2)),
      hi_80: Number((mean + 1.2816 * std).toFixed(2)),
      lo_90: Number((mean - 1.6449 * std).toFixed(2)),
      hi_90: Number((mean + 1.6449 * std).toFixed(2)),
      lo_95: Number((mean - 1.9600 * std).toFixed(2)),
      hi_95: Number((mean + 1.9600 * std).toFixed(2)),
    };
  }

  /**
   * Constructs step envelope for all predicted states
   */
  static buildStepEnvelope(
    predictedStates: {
      temperature_c: number;
      pressure_bar: number;
      power_kw: number;
      vibration_mm_s: number;
      cooling_efficiency: number;
    },
    assessment: OperatingRegionAssessment,
    horizonStep: number
  ): PredictionStepEnvelope {
    const sigmas = COOLING_SYSTEM_CONSTANTS.NOISE_SIGMA;

    return {
      step: horizonStep,
      variables: {
        temperature_c: this.buildVariableEnvelope(predictedStates.temperature_c, sigmas.temperature, assessment.epistemicMultiplier, horizonStep),
        pressure_bar: this.buildVariableEnvelope(predictedStates.pressure_bar, sigmas.pressure, assessment.epistemicMultiplier, horizonStep),
        power_kw: this.buildVariableEnvelope(predictedStates.power_kw, sigmas.power, assessment.epistemicMultiplier, horizonStep),
        vibration_mm_s: this.buildVariableEnvelope(predictedStates.vibration_mm_s, sigmas.vibration, assessment.epistemicMultiplier, horizonStep),
        cooling_efficiency: this.buildVariableEnvelope(predictedStates.cooling_efficiency, 1.2, assessment.epistemicMultiplier, horizonStep),
      },
      reliability_level: assessment.level,
      region_key: assessment.regionKey,
      reliability_reason: assessment.reasons[0],
    };
  }
}
