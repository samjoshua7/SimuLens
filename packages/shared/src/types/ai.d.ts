import { IntervenableVariable } from './causal.js';
export type AIIntent = 'predict' | 'intervention' | 'counterfactual' | 'explain' | 'diagnose';
export interface StructuredAIRequest {
    intent: AIIntent;
    target_variable?: IntervenableVariable;
    forced_value?: number;
    horizon?: number;
    change_step?: number;
    user_query: string;
    explanation_prompt?: string;
}
export interface StructuredAIResponse {
    intent: AIIntent;
    recognized_action?: {
        variable: IntervenableVariable;
        value: number;
        horizon: number;
    };
    summary: string;
    reasoning_rationale: string;
    suggested_next_steps: string[];
}
//# sourceMappingURL=ai.d.ts.map