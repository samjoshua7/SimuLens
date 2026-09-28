import dotenv from 'dotenv';
import { StructuredAIRequest, StructuredAIResponse, IntervenableVariable } from '@simulens/shared';

dotenv.config({ path: '../../.env' });
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

export class AIService {
  /**
   * Interprets natural language user query and extracts structured intent.
   * STRICT PRINCIPLE: The LLM is an interface only, NEVER the prediction engine.
   */
  async interpretQuery(req: StructuredAIRequest): Promise<StructuredAIResponse> {
    const text = req.user_query.trim();

    if (OPENROUTER_API_KEY && !OPENROUTER_API_KEY.includes('sk-or-v1-...')) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://simulens.dev',
            'X-Title': 'SimuLens Causal Engine',
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              {
                role: 'system',
                content: `You are the SimuLens NL-to-Intervention parser.
Convert the user request into a strictly validated JSON object with this shape:
{
  "intent": "intervention" | "counterfactual" | "predict" | "explain",
  "recognized_action": {
    "variable": "fan_speed" | "machine_load" | "coolant_flow" | "cooling_setpoint",
    "value": number (0-100),
    "horizon": number (default 5)
  },
  "summary": string,
  "reasoning_rationale": string,
  "suggested_next_steps": string[]
}
Never predict numbers yourself. The numerical simulation will be performed by the deterministic causal engine.`
              },
              {
                role: 'user',
                content: text
              }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (response.ok) {
          const json = (await response.json()) as any;
          const parsed = JSON.parse(json.choices[0].message.content) as StructuredAIResponse;
          return this.validateAndSanitize(parsed);
        }
      } catch (err) {
        console.warn('[AIService] OpenRouter call failed, falling back to local deterministic parser:', err);
      }
    }

    // Deterministic rule-based fallback parser
    return this.parseLocalHeuristic(text);
  }

  private parseLocalHeuristic(text: string): StructuredAIResponse {
    const lower = text.toLowerCase();

    // Check for variable match
    let variable: IntervenableVariable = 'fan_speed';
    if (lower.includes('fan')) {
      variable = 'fan_speed';
    } else if (lower.includes('load') || lower.includes('workload')) {
      variable = 'machine_load';
    } else if (lower.includes('coolant') || lower.includes('pump') || lower.includes('flow')) {
      variable = 'coolant_flow';
    } else if (lower.includes('setpoint') || lower.includes('target')) {
      variable = 'cooling_setpoint';
    }

    // Extract numeric percentage
    const numMatch = text.match(/(\d+(\.\d+)?)\s*%/);
    const bareNumMatch = text.match(/\b(to|at|set|increase|decrease)\s+(\d+(\.\d+)?)\b/i);
    let value = 70;

    if (numMatch) {
      value = parseFloat(numMatch[1]);
    } else if (bareNumMatch) {
      value = parseFloat(bareNumMatch[2]);
    } else {
      // Relative keywords
      if (lower.includes('max') || lower.includes('full')) value = 100;
      else if (lower.includes('min') || lower.includes('off')) value = 0;
      else if (lower.includes('half')) value = 50;
    }

    const intent = lower.includes('what if we had') || lower.includes('earlier') || lower.includes('history')
      ? 'counterfactual'
      : 'intervention';

    return {
      intent,
      recognized_action: {
        variable,
        value: Math.min(100, Math.max(0, value)),
        horizon: 6,
      },
      summary: `Parsed request: Intervene on ${variable} and set value to ${value}%.`,
      reasoning_rationale: `Detected intent '${intent}'. The causal world model will perform graph surgery do(${variable} = ${value}%) and propagate through structural mechanisms.`,
      suggested_next_steps: [
        `Simulate trajectory with ${variable} forced to ${value}%`,
        `Inspect prediction envelope and 90% confidence bands`,
        `Validate against simulator ground truth`,
      ],
    };
  }

  private validateAndSanitize(res: StructuredAIResponse): StructuredAIResponse {
    if (res.recognized_action) {
      const allowedVars: IntervenableVariable[] = ['fan_speed', 'machine_load', 'coolant_flow', 'cooling_setpoint'];
      if (!allowedVars.includes(res.recognized_action.variable)) {
        res.recognized_action.variable = 'fan_speed';
      }
      res.recognized_action.value = Math.min(100, Math.max(0, Number(res.recognized_action.value) || 50));
      res.recognized_action.horizon = Math.min(20, Math.max(1, Number(res.recognized_action.horizon) || 5));
    }
    return res;
  }
}

export const aiService = new AIService();
