import { COOLING_SYSTEM_CONSTANTS } from '@simulens/shared';
export class OperatingRegionEvaluator {
    /**
     * Assesses the reliability of a given operating point based on distance to nominal domain
     */
    static assess(state, action, env) {
        const bounds = COOLING_SYSTEM_CONSTANTS.NOMINAL_BOUNDS;
        const reasons = [];
        let maxOodRatio = 0.0;
        // Helper to evaluate variable distance beyond nominal bounds
        const checkBound = (name, val, min, max, unit) => {
            if (val < min) {
                const ratio = (min - val) / (max - min);
                maxOodRatio = Math.max(maxOodRatio, ratio);
                reasons.push(`${name} (${val.toFixed(1)}${unit}) is below nominal minimum (${min}${unit})`);
            }
            else if (val > max) {
                const ratio = (val - max) / (max - min);
                maxOodRatio = Math.max(maxOodRatio, ratio);
                reasons.push(`${name} (${val.toFixed(1)}${unit}) exceeds nominal maximum (${max}${unit})`);
            }
        };
        checkBound('Machine Load', action.machine_load, bounds.machine_load.min, bounds.machine_load.max, '%');
        checkBound('Fan Speed', action.fan_speed, bounds.fan_speed.min, bounds.fan_speed.max, '%');
        checkBound('Coolant Flow', action.coolant_flow, bounds.coolant_flow.min, bounds.coolant_flow.max, '%');
        checkBound('Ambient Temp', env.ambient_temperature, bounds.ambient_temperature.min, bounds.ambient_temperature.max, '°C');
        checkBound('Temperature', state.temperature_c, bounds.temperature_c.min, bounds.temperature_c.max, '°C');
        let level = 'high';
        let epistemicMultiplier = 1.0;
        let regionKey = 'REG-NOMINAL';
        if (maxOodRatio > 0.4) {
            level = 'low';
            epistemicMultiplier = 3.5;
            regionKey = 'REG-OOD-EXTREME';
        }
        else if (maxOodRatio > 0.05) {
            level = 'medium';
            epistemicMultiplier = 1.8;
            regionKey = 'REG-BOUNDARY';
        }
        return {
            level,
            regionKey,
            distanceOOD: Number(maxOodRatio.toFixed(3)),
            epistemicMultiplier,
            reasons: reasons.length > 0 ? reasons : ['Operating point is well-centered within nominal observed regime.'],
        };
    }
}
//# sourceMappingURL=regions.js.map