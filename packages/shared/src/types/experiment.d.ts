import { SystemState, ControllableAction, EnvironmentCondition, TelemetryStep } from './system.js';
import { PredictionEnvelope } from './envelope.js';
import { InterventionSpec, CounterfactualSpec } from './causal.js';
export interface ValidationComparison {
    horizon_step: number;
    variable: keyof SystemState;
    predicted_mean: number;
    actual_value: number;
    error: number;
    lo_90: number;
    hi_90: number;
    in_interval_90: boolean;
}
export interface ValidationSummary {
    mae: Record<string, number>;
    rmse: Record<string, number>;
    picp_90: Record<string, number>;
    comparisons: ValidationComparison[];
}
export interface ExperimentRecord {
    id?: string;
    name: string;
    description?: string;
    seed: number;
    initial_state: SystemState;
    actions: ControllableAction[];
    environment: EnvironmentCondition;
    predicted_trajectory: PredictionEnvelope;
    actual_trajectory?: TelemetryStep[];
    intervention?: InterventionSpec;
    counterfactual?: CounterfactualSpec;
    metrics?: ValidationSummary;
    created_at?: string;
}
//# sourceMappingURL=experiment.d.ts.map