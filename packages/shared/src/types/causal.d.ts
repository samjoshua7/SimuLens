/**
 * Target variable for intervention do(X = x)
 */
export type IntervenableVariable = 'fan_speed' | 'machine_load' | 'coolant_flow' | 'cooling_setpoint';
export interface InterventionSpec {
    target_variable: IntervenableVariable;
    forced_value: number;
    start_step: number;
    horizon: number;
}
export interface CounterfactualSpec {
    episode_id?: string;
    change_step: number;
    changed_variable: IntervenableVariable;
    new_value: number;
    recorded_steps: Array<{
        t: number;
        machine_load: number;
        fan_speed: number;
        coolant_flow: number;
        ambient_temperature: number;
        temperature_c: number;
        pressure_bar: number;
        power_kw: number;
        vibration_mm_s: number;
        cooling_efficiency: number;
    }>;
}
export interface CausalGraphNode {
    id: string;
    label: string;
    type: 'action' | 'environment' | 'state' | 'latent';
    unit: string;
}
export interface CausalGraphEdge {
    source: string;
    target: string;
    isDirect: boolean;
    notes?: string;
}
export interface CausalGraphSpec {
    version: string;
    nodes: CausalGraphNode[];
    edges: CausalGraphEdge[];
}
//# sourceMappingURL=causal.d.ts.map