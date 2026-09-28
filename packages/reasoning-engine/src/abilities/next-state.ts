import {
  SystemState,
  ControllableAction,
  EnvironmentCondition,
  PredictionEnvelope
} from '@simulens/shared';
import { OperatingRegionEvaluator } from '@simulens/world-model';
import { CoolingSystemSimulator } from '@simulens/simulation-engine';
import { UncertaintyEngine } from '../uncertainty.js';

export interface NextStatePredictionRequest {
  currentState: SystemState;
  action: ControllableAction;
  environment: EnvironmentCondition;
}

export class NextStatePredictor {
  /**
   * Ability 1: Next-state prediction P(S_{t+1} | S_t)
   * Predicts next single step with calibrated uncertainty envelope.
   */
  static predict(req: NextStatePredictionRequest): PredictionEnvelope {
    // Noise-free transition expectation
    const sim = new CoolingSystemSimulator({ noise_enabled: false });
    const stepRecord = sim.step(req.currentState, req.action, req.environment, 0);

    const assessment = OperatingRegionEvaluator.assess(
      req.currentState,
      req.action,
      req.environment
    );

    const stepEnvelope = UncertaintyEngine.buildStepEnvelope(
      stepRecord.observed.state,
      assessment,
      1
    );

    return {
      ability: 'next_state',
      horizon: 1,
      steps: [stepEnvelope],
      assumptions: ['C1', 'C2', 'O1', 'R1', 'R2'],
      timestamp: new Date().toISOString(),
    };
  }
}
