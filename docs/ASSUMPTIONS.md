# SimuLens — Explicit System Assumptions

All predictions, models, and interventions in SimuLens reference stable assumption IDs.
Any causal or inferential claim must link back to one or more of these IDs.

---

## 1. Causal Assumptions (C)

| ID | Title | Statement | Verification / Stress Test |
|---|---|---|---|
| **C1** | Known Graph Structure | The expert causal DAG defines direct mechanism dependencies. Variables with no directed edge do not directly cause one another within the step. | Graph misspecification experiment (evaluate with spurious or inverted edge). |
| **C2** | No Instantaneous Feedback | Within a single discrete time-step, there are no cyclical dependencies, except the strictly acyclic topological ordering: $L_t, F_t, C_t, Ta_t \to T_{t+1} \to P_{t+1}, W_{t+1}, V_{t+1}$. | Static cycle detection on the adjacency matrix in `packages/world-model`. |
| **C3** | Mechanism Invariance under `do()` | Intervening on variable $X$ ($do(X = x)$) replaces its structural mechanism without altering structural mechanisms of other variables (Modularity / Pearl's Autonomy). | Invariance tests comparing un-intervened conditional distributions before and after graph surgery. |

---

## 2. Observability Assumptions (O)

| ID | Title | Statement | Verification / Stress Test |
|---|---|---|---|
| **O1** | Observed Variables | Machine load $L$, fan speed $F$, coolant flow $C$, ambient temperature $Ta$, machine temperature $T$, pressure $P$, power $W$, and vibration $V$ are observable (with sensor noise). | Sensor noise injection experiments. |
| **O2** | Latent Fouling | Heat exchanger fouling factor $\phi_t \in [0, 1]$ is a latent physical state. It is never directly observed by the model or gateway. | `tests/test_no_leakage` ensuring models only ingest observed columns. |
| **O3** | Complete Telemetry | Trajectories have synchronous sampling intervals (30s) with no missing data in nominal episodes. | Missing data imputation benchmark (future extension). |

---

## 3. Randomness & Exogenous Noise (R)

| ID | Title | Statement | Verification / Stress Test |
|---|---|---|---|
| **R1** | Additive Seeded Noise | Exogenous noise terms $\epsilon \sim \mathcal{N}(0, \sigma^2)$ are additive, mutually independent, and reproducible via explicit pseudo-random number generator seeds. | Exact deterministic replay under identical seed. |
| **R2** | Gaussian Baseline | Nominal process and sensor noise follows Gaussian distributions. | Heavy-tailed student-t or Laplace noise stress experiment. |
| **R3** | Homoscedasticity | Nominal noise scales $\sigma_i$ are constant across the nominal operating range. | Heteroscedastic noise stress test in high temperature/load regimes. |

---

## 4. Identifiability Assumptions (I)

| ID | Title | Statement | Verification / Stress Test |
|---|---|---|---|
| **I1** | Observational Identifiability | When policies depend solely on observed states and exogenous ambient factors, causal effects are identifiable via backdoor adjustment on $\{Ta, L, F, C\}$. | Observational adjustment vs interventional ground truth comparisons. |
| **I2** | Confounded Latent Risk | When historical policies react to the hidden fouling $\phi$ (e.g., operator notices degradation unrecorded in data and manually boosts fan), observational estimators suffer confounding bias. | Confounded hidden policy experiment demonstrating observational vs causal gap. |

---

## 5. Industrial Cooling System Physical Reference Parameters

| Parameter | Symbol | Value | Unit | Description |
|---|---|---|---|---|
| Ambient Mean | $Ta_{mean}$ | 25.0 | °C | Diurnal baseline ambient temperature |
| Mean Reversion Rate | $\kappa$ | 0.05 | - | Ambient temperature drift back to diurnal mean |
| Load Heat Constant | $a_1$ | 0.85 | °C/(%·step) | Thermal heat generated per % of machine load |
| Fan Cooling Coeff | $b_1$ | 0.50 | - | Heat transfer coefficient from forced convection fan |
| Coolant Cooling Coeff | $b_2$ | 0.70 | - | Heat transfer coefficient from liquid coolant circulation |
| Thermal Dissipation Scale | $\eta_T$ | 0.15 | - | Temperature inertia / thermal mass scaling |
| Fouling Drift Rate | $\delta$ | 0.0005 | step⁻¹ | Latent scale buildup on heat exchanger per step |
| Fouling Maximum | $\phi_{max}$ | 0.80 | - | Maximum physical limit of fouling obstruction |
| Pressure Baseline | $p_0$ | 2.0 | bar | Atmospheric/base line pressure |
| Coolant Pressure Coeff | $p_1$ | 0.04 | bar/% | Pressure increase from coolant pump rate |
| Thermal Expansion Coeff | $p_2$ | 0.08 | bar/°C | Thermal pressure coefficient |
| Power Idle Baseline | $w_0$ | 1.5 | kW | Machine baseline idle power |
| Load Power Coeff | $w_1$ | 0.18 | kW/% | Electrical work per unit machine load |
| Fan Cube Power Coeff | $w_2$ | 8.0 | kW | Fan cubic aerodynamic affinity power law $(F/100)^3$ |
| Coolant Pump Power Coeff | $w_3$ | 0.06 | kW/% | Coolant circulation pump power draw |
| Vibration Baseline | $v_0$ | 0.2 | mm/s | Background structural vibration |
| Load Vibration Coeff | $v_1$ | 0.015 | (mm/s)/% | Mechanical stress vibration from spindle/motor |
| Fan Vibration Coeff | $v_2$ | 0.010 | (mm/s)/% | Aerodynamic/bearing vibration from fan |
| Fouling Vibration Coeff | $v_3$ | 1.5 | mm/s | Cavitation / turbulence vibration induced by fouling |
