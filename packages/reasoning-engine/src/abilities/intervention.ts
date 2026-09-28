import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  InterventionSpec,
  PredictionEnvelope,
  PredictionStepEnvelope
} from '@simulens/shared';
import { CausalGraph, OperatingRegionEvaluator } from '@simulens/world-model';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { UncertaintyEngine } from '../uncertainty.js';

export interface InterventionSimulationRequest {
  currentState: SystemState;
  nominalAction: ControllableAction;
  intervention: InterventionSpec;
  environment: EnvironmentCondition;
}

export interface InterventionResult {
  prediction: PredictionEnvelope;
  graphSurgery: {
    intervenedVariable: string;
    severedEdges: Array<{ source: string; target: string }>;
  };
  beforeState: SystemState;
  afterStateExpected: SystemState;
}

export class InterventionEngine {
  /**
   * Ability 3: Intervention simulation via Pearl's do(X = x) graph surgery
   */
  static simulate(req: InterventionSimulationRequest): InterventionResult {
    const graph = new CausalGraph();
    // 1. Perform graph surgery: incoming edges to intervenedVariable are severed
    const targetVar = req.intervention.target_variable;
    const incomingParents = graph.getParents(targetVar);
    const severedEdges = incomingParents.map((p: string) => ({ source: p, target: targetVar }));

    // 2. Propagate forced variable through the system
    const sim = new CoolingSystemSimulator({ noise_enabled: false });
    const horizon = req.intervention.horizon;
    const stepEnvelopes: PredictionStepEnvelope[] = [];

    let curState = { ...req.currentState };
    let curEnv = { ...req.environment };

    for (let h = 1; h <= horizon; h++) {
      // Apply intervention override
      const action: ControllableAction = {
        ...req.nominalAction,
        [targetVar]: req.intervention.forced_value,
      };

      const stepRecord = sim.step(curState, action, curEnv, h - 1);
      const assessment = OperatingRegionEvaluator.assess(curState, action, curEnv);
      const stepEnv = UncertaintyEngine.buildStepEnvelope(
        stepRecord.observed.state,
        assessment,
        h
      );

      stepEnvelopes.push(stepEnv);
      curState = stepRecord.observed.state;
      curEnv = stepRecord.observed.environment;
    }

    const prediction: PredictionEnvelope = {
      ability: 'intervention',
      horizon,
      steps: stepEnvelopes,
      assumptions: ['C1', 'C2', 'C3', 'O1', 'R1', 'I1'],
      timestamp: new Date().toISOString(),
    };

    return {
      prediction,
      graphSurgery: {
        intervenedVariable: targetVar,
        severedEdges,
      },
      beforeState: req.currentState,
      afterStateExpected: curState,
    };
  }
}
