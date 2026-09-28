import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  PredictionEnvelope,
  PredictionStepEnvelope
} from '@simulens/shared';
import { OperatingRegionEvaluator } from '@simulens/world-model';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { UncertaintyEngine } from '../uncertainty.js';

export interface ActionConditionedPredictionRequest {
  currentState: SystemState;
  actions: ControllableAction[]; // Actions over horizon H
  environment: EnvironmentCondition;
}

export class ActionConditionedPredictor {
  /**
   * Ability 2: Action-conditioned prediction P(S_{t+h} | S_t, A_t = a)
   * Predicts multi-step trajectory under proposed actions with compounding uncertainty.
   */
  static predict(req: ActionConditionedPredictionRequest): PredictionEnvelope {
    const horizon = req.actions.length;
    const sim = new CoolingSystemSimulator({ noise_enabled: false });
    const stepEnvelopes: PredictionStepEnvelope[] = [];

    let curState = { ...req.currentState };
    let curEnv = { ...req.environment };

    for (let h = 1; h <= horizon; h++) {
      const action = req.actions[h - 1];
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

    return {
      ability: 'action_conditioned',
      horizon,
      steps: stepEnvelopes,
      assumptions: ['C1', 'C2', 'O1', 'R1', 'R2', 'I1'],
      timestamp: new Date().toISOString(),
    };
  }
}
