export declare const COOLING_SYSTEM_CONSTANTS: {
    DOMAIN: string;
    VERSION: string;
    DT_SECONDS: number;
    PHYSICS: {
        ambient_mean: number;
        kappa_reversion: number;
        a1_load_heat: number;
        b1_fan_cool: number;
        b2_coolant_cool: number;
        eta_t_inertia: number;
        delta_fouling: number;
        phi_max: number;
        p0_pressure: number;
        p1_coolant_press: number;
        p2_temp_press: number;
        w0_idle_power: number;
        w1_load_power: number;
        w2_fan_cube: number;
        w3_coolant_power: number;
        v0_idle_vib: number;
        v1_load_vib: number;
        v2_fan_vib: number;
        v3_fouling_vib: number;
    };
    NOISE_SIGMA: {
        ambient: number;
        temperature: number;
        pressure: number;
        power: number;
        vibration: number;
        fouling: number;
    };
    NOMINAL_BOUNDS: {
        machine_load: {
            min: number;
            max: number;
        };
        fan_speed: {
            min: number;
            max: number;
        };
        coolant_flow: {
            min: number;
            max: number;
        };
        ambient_temperature: {
            min: number;
            max: number;
        };
        temperature_c: {
            min: number;
            max: number;
        };
        pressure_bar: {
            min: number;
            max: number;
        };
        power_kw: {
            min: number;
            max: number;
        };
        vibration_mm_s: {
            min: number;
            max: number;
        };
    };
    PHYSICAL_LIMITS: {
        machine_load: {
            min: number;
            max: number;
        };
        fan_speed: {
            min: number;
            max: number;
        };
        coolant_flow: {
            min: number;
            max: number;
        };
        ambient_temperature: {
            min: number;
            max: number;
        };
        temperature_c: {
            min: number;
            max: number;
        };
        pressure_bar: {
            min: number;
            max: number;
        };
        power_kw: {
            min: number;
            max: number;
        };
        vibration_mm_s: {
            min: number;
            max: number;
        };
    };
};
//# sourceMappingURL=cooling.d.ts.map