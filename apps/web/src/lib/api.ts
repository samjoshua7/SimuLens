import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  TelemetryStep,
  PredictionEnvelope,
  InterventionSpec,
  CounterfactualSpec,
  CausalGraphSpec,
  ExperimentRecord,
  StructuredAIRequest,
  StructuredAIResponse,
  ValidationSummary
} from '@simulens/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error [${res.status}]: ${errorText || res.statusText}`);
  }

  return res.json();
}

export const api = {
  getInitialState: () =>
    request<{ state: SystemState; action: ControllableAction; environment: EnvironmentCondition }>(
      '/api/simulation/initial'
    ),

  stepSimulation: (currentState: SystemState, action: ControllableAction, environment: EnvironmentCondition, seed?: number) =>
    request<{ t: number; observed: TelemetryStep }>('/api/simulation/step', {
      method: 'POST',
      body: JSON.stringify({ currentState, action, environment, seed }),
    }),

  runSimulation: (initialState: SystemState, actions: ControllableAction[], environment: EnvironmentCondition, seed?: number) =>
    request<{ trajectory: TelemetryStep[] }>('/api/simulation/run', {
      method: 'POST',
      body: JSON.stringify({ initialState, actions, environment, seed }),
    }),

  predictNextState: (currentState: SystemState, action: ControllableAction, environment: EnvironmentCondition) =>
    request<PredictionEnvelope>('/api/prediction/next-state', {
      method: 'POST',
      body: JSON.stringify({ currentState, action, environment }),
    }),

  predictActionConditioned: (currentState: SystemState, actions: ControllableAction[], environment: EnvironmentCondition) =>
    request<PredictionEnvelope>('/api/prediction/action-conditioned', {
      method: 'POST',
      body: JSON.stringify({ currentState, actions, environment }),
    }),

  simulateIntervention: (
    currentState: SystemState,
    nominalAction: ControllableAction,
    intervention: InterventionSpec,
    environment: EnvironmentCondition
  ) =>
    request<{
      prediction: PredictionEnvelope;
      graphSurgery: {
        intervenedVariable: string;
        severedEdges: Array<{ source: string; target: string }>;
      };
      beforeState: SystemState;
      afterStateExpected: SystemState;
    }>('/api/intervention/simulate', {
      method: 'POST',
      body: JSON.stringify({ currentState, nominalAction, intervention, environment }),
    }),

  runCounterfactual: (spec: CounterfactualSpec) =>
    request<{
      actualTrajectory: Array<{ t: number; action: ControllableAction; state: SystemState; environment: EnvironmentCondition }>;
      counterfactualTrajectory: Array<{ t: number; action: ControllableAction; state: SystemState; environment: EnvironmentCondition }>;
      predictionEnvelope: PredictionEnvelope;
      abductedResiduals: Array<{ t: number; eps_temp: number; eps_pressure: number; eps_power: number; eps_vibration: number }>;
      divergenceSummary: {
        temperatureDiff: number;
        powerDiff: number;
        pressureDiff: number;
        coolingEfficiencyDiff: number;
      };
    }>('/api/counterfactual/run', {
      method: 'POST',
      body: JSON.stringify(spec),
    }),

  evaluateValidation: (prediction: PredictionEnvelope, actualTrajectory: TelemetryStep[]) =>
    request<ValidationSummary>('/api/validation/evaluate', {
      method: 'POST',
      body: JSON.stringify({ prediction, actualTrajectory }),
    }),

  getCausalGraph: () => request<CausalGraphSpec>('/api/causal/graph'),

  listExperiments: () => request<{ experiments: ExperimentRecord[] }>('/api/experiments'),

  saveExperiment: (exp: ExperimentRecord) =>
    request<ExperimentRecord>('/api/experiments', {
      method: 'POST',
      body: JSON.stringify(exp),
    }),

  interpretWithAI: (query: string, intent: StructuredAIRequest['intent'] = 'intervention') =>
    request<StructuredAIResponse>('/api/ai/interpret', {
      method: 'POST',
      body: JSON.stringify({ user_query: query, intent }),
    }),
};
