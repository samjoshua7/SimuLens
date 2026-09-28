import { SystemState, ControllableAction, EnvironmentCondition, ReliabilityLevel } from '@simulens/shared';
export interface OperatingRegionAssessment {
    level: ReliabilityLevel;
    regionKey: string;
    distanceOOD: number;
    epistemicMultiplier: number;
    reasons: string[];
}
export declare class OperatingRegionEvaluator {
    /**
     * Assesses the reliability of a given operating point based on distance to nominal domain
     */
    static assess(state: SystemState, action: ControllableAction, env: EnvironmentCondition): OperatingRegionAssessment;
}
//# sourceMappingURL=regions.d.ts.map