# Antigravity Guidelines for SimuLens

Please refer to the repository constitution in [AGENTS.md](./AGENTS.md). Also read [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md) and [HANDOVER.md](./HANDOVER.md) before starting.

All rules are strictly enforced, including:
- **Fan-Out & Harsh Critic Loop**
- **No LLM in the prediction path; every prediction carries uncertainty**
- **Four abilities stay separated** (next-state, action-conditioned, intervention, counterfactual)
- **Leakage Rule** (models never see ground truth, latent state, or noise draws)
- **Never fabricate numbers** (metrics come only from stored evaluation runs)
- **Human Terminal Rule**
- **Database-First Rule**
- **Reproducibility Rule**
- **Handover Rule**
