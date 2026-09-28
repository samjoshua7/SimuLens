/**
 * Seeded PRNG using Mulberry32 algorithm
 * Fully deterministic across all platforms.
 */
export declare class SeededRNG {
    private state;
    constructor(seed?: number);
    /**
     * Generates next pseudo-random float in [0, 1)
     */
    nextFloat(): number;
    /**
     * Generates standard normal random variable N(mean, std^2)
     * Using Box-Muller transform
     */
    nextGaussian(mean?: number, std?: number): number;
}
//# sourceMappingURL=rng.d.ts.map