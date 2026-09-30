/**
 * Framework-free countdown engine (no Angular, no RxJS).
 *
 * Why it exists: all timing logic lives here so it can be unit-tested with a
 * fake clock, and so the Angular component stays a thin view.
 *
 * Key ideas
 *  - The countdown is a *deadline on a monotonic clock* (performance.now()),
 *    never a decremented counter. Throttled tabs, timer jitter and system
 *    clock changes therefore cannot make it drift.
 *  - Exactly ONE timeout is pending at a time, and it is scheduled for the
 *    precise moment the displayed number changes (not "every 1000 ms").
 *    Result: no drift, no wasted ticks, nothing scheduled after 0.
 *  - While the page is hidden nothing is scheduled at all; on return the
 *    value is recomputed from the clock in one step.
 */

export interface Scheduler {
  /** Monotonic milliseconds. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Whole seconds left (rounded up), never negative. */
export function secondsRemaining(deadlineAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

/**
 * Milliseconds until `secondsRemaining` next changes, or -1 when it is
 * already 0 (nothing left to schedule).
 */
export function msUntilNextChange(deadlineAt: number, now: number): number {
  const remaining = deadlineAt - now;
  if (remaining <= 0) return -1;
  const shown = Math.ceil(remaining / 1000);
  return remaining - (shown - 1) * 1000; // > 0 by construction
}

/**
 * Converts "seconds left" reported by the server into a monotonic deadline.
 * The server computed its answer somewhere between request start (t0) and
 * response arrival (t1); the midpoint is the best unbiased estimate, which
 * removes about half the network latency from the countdown.
 */
export function estimateDeadlineAt(t0: number, t1: number, secondsLeft: number): number {
  return t0 + (t1 - t0) / 2 + secondsLeft * 1000;
}

export class Countdown {
  private timer: unknown = undefined;
  private last: number | null = null;
  private hidden = false;
  private stopped = false;

  constructor(
    private readonly deadlineAt: number,
    private readonly onTick: (secondsLeft: number) => void,
    private readonly scheduler: Scheduler = browserScheduler,
  ) {}

  /** Emits the current value immediately, then on every change until 0. */
  start(): void {
    this.tick();
  }

  /** Pause scheduling while hidden; recompute and resume when visible. */
  setHidden(hidden: boolean): void {
    if (this.stopped || hidden === this.hidden) return;
    this.hidden = hidden;
    this.clear();
    if (!hidden) this.tick();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  private tick = (): void => {
    this.timer = undefined;
    if (this.stopped) return;
    const now = this.scheduler.now();
    const seconds = secondsRemaining(this.deadlineAt, now);
    if (seconds !== this.last) {
      this.last = seconds;
      this.onTick(seconds);
      if (this.stopped) return; // onTick may have destroyed us
    }
    if (this.hidden) return;
    const wait = msUntilNextChange(this.deadlineAt, now);
    if (wait >= 0) this.timer = this.scheduler.setTimeout(this.tick, wait);
  };

  private clear(): void {
    if (this.timer !== undefined) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
