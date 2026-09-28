/**
 * Seeded PRNG using Mulberry32 algorithm
 * Fully deterministic across all platforms.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  /**
   * Generates next pseudo-random float in [0, 1)
   */
  nextFloat(): number {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates standard normal random variable N(mean, std^2)
   * Using Box-Muller transform
   */
  nextGaussian(mean: number = 0, std: number = 1): number {
    let u1 = this.nextFloat();
    let u2 = this.nextFloat();
    // Guard against log(0)
    while (u1 === 0) {
      u1 = this.nextFloat();
    }
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }
}
