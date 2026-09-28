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

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  simulation?: {
    ability: 'next_state' | 'action_conditioned' | 'intervention' | 'counterfactual' | 'reliability';
    machine_id?: string;
    machine_label?: string;
    target_variable?: string;
    forced_value?: number;
    envelope?: any;
    surgery?: any;
    divergence?: any;
    reliability?: any;
  };
  suggestions?: string[];
}

export interface CopilotChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  target_machine_id?: string;
  machines?: Array<{
    id: string;
    label: string;
    machine_type: string;
    status: string;
    telemetry?: Record<string, any>;
    config?: Record<string, any>;
  }>;
  branch_name?: string;
}

export interface CopilotChatResponse {
  message: string;
  intent: AIIntent;
  target_machine_id?: string;
  recognized_action?: {
    variable: IntervenableVariable;
    value: number;
    horizon: number;
  };
  simulation_payload?: {
    ability: 'next_state' | 'action_conditioned' | 'intervention' | 'counterfactual' | 'reliability';
    target_machine_id: string;
    variable?: IntervenableVariable;
    value?: number;
    horizon?: number;
  };
  plant_summary?: {
    status: 'nominal' | 'caution' | 'warning' | 'critical';
    headline: string;
    hotspots: string[];
    active_load_avg_pct: number;
  };
  suggested_prompts: string[];
}
