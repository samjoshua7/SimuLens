import { SystemState, ControllableAction, EnvironmentCondition, SimulationStepRecord } from '@simulens/shared';
export interface SimulatorConfig {
    seed?: number;
    initial_fouling?: number;
    noise_enabled?: boolean;
}
export declare class CoolingSystemSimulator {
    private rng;
    private currentFouling;
    private noiseEnabled;
    constructor(config?: SimulatorConfig);
    /**
     * Reset simulator state and seed
     */
    reset(seed?: number, initial_fouling?: number): void;
    /**
     * Generate initial default steady-state
     */
    static getInitialState(): {
        state: SystemState;
        action: ControllableAction;
        environment: EnvironmentCondition;
    };
    /**
     * Execute single deterministic step transition
     * S(t+1) = f(S(t), A(t), E(t), noise)
     */
    step(currentState: SystemState, action: ControllableAction, env: EnvironmentCondition, t?: number): SimulationStepRecord;
    /**
     * Run multi-step rollout given initial state and either static action or action array
     */
    rollout(initialState: SystemState, actions: ControllableAction[], initialEnv: EnvironmentCondition, startT?: number): SimulationStepRecord[];
}
//# sourceMappingURL=simulator.d.ts.map