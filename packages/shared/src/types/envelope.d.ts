export type ReliabilityLevel = 'high' | 'medium' | 'low';
/**
 * Uncertainty envelope for a single continuous variable at a given horizon step.
 * Strictly separates aleatoric (irreducible process/sensor noise) from
 * epistemic (model uncertainty / OOD distance from observed domain).
 */
export interface VariableEnvelope {
    mean: number;
    std: number;
    aleatoric_std: number;
    epistemic_std: number;
    lo_50: number;
    hi_50: number;
    lo_80: number;
    hi_80: number;
    lo_90: number;
    hi_90: number;
    lo_95: number;
    hi_95: number;
}
/**
 * Full prediction envelope for all predicted states at a specific future step.
 */
export interface PredictionStepEnvelope {
    step: number;
    variables: {
        temperature_c: VariableEnvelope;
        pressure_bar: VariableEnvelope;
        power_kw: VariableEnvelope;
        vibration_mm_s: VariableEnvelope;
        cooling_efficiency: VariableEnvelope;
    };
    reliability_level: ReliabilityLevel;
    region_key: string;
    reliability_reason?: string;
}
/**
 * Complete Prediction Result payload returned by all inference engines.
 */
export interface PredictionEnvelope {
    ability: 'next_state' | 'action_conditioned' | 'intervention' | 'counterfactual';
    horizon: number;
    steps: PredictionStepEnvelope[];
    assumptions: string[];
    model_id?: string;
    timestamp: string;
}
//# sourceMappingURL=envelope.d.ts.map