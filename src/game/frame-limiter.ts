/** Frame pacing for displays whose refresh rate does not divide the FPS cap. */
export class FrameLimiter {
  private previous: number;
  private credit = 0;
  private previousCap: number;

  constructor(start: number, cap: number) {
    this.previous = start;
    this.previousCap = cap;
  }

  /** A cap of zero leaves requestAnimationFrame unrestricted. */
  shouldRender(now: number, cap: number): boolean {
    const elapsed = Math.max(0, now - this.previous);
    this.previous = now;
    if (cap !== this.previousCap) {
      this.credit = 0;
      this.previousCap = cap;
    }
    if (cap <= 0) {
      this.credit = 0;
      return true;
    }

    const interval = 1000 / cap;
    this.credit += elapsed;
    if (this.credit + 0.05 < interval) return false;
    // Keep the fractional remainder: a 120 FPS cap on a 144 Hz display
    // should render five out of six frames, not every other frame (72 FPS).
    this.credit = Math.max(0, this.credit - interval);
    if (this.credit >= interval) this.credit %= interval;
    return true;
  }
}
