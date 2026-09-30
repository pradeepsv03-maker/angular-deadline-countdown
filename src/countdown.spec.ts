import {
  Countdown,
  Scheduler,
  browserScheduler,
  estimateDeadlineAt,
  msUntilNextChange,
  secondsRemaining,
} from './countdown';

/** Deterministic scheduler: time only moves when the test says so. */
class FakeScheduler implements Scheduler {
  time = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = () => this.time;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => void this.timers.delete(h as number);
  get pending(): number { return this.timers.size; }
  /** Runs timers in order up to `ms` ahead, like a real event loop. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let nextId = -1, nextAt = Infinity;
      for (const [id, t] of this.timers) if (t.at < nextAt) { nextAt = t.at; nextId = id; }
      if (nextId < 0 || nextAt > end) break;
      const t = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.time = Math.max(this.time, nextAt);
      t.fn();
    }
    this.time = end;
  }
  /** Simulates a throttled tab: the clock jumps, timers fire once, late. */
  jump(ms: number): void {
    this.time += ms;
    const due = [...this.timers.entries()].filter(([, t]) => t.at <= this.time);
    for (const [id, t] of due) { this.timers.delete(id); t.fn(); }
  }
}

function run(deadlineAt: number, s = new FakeScheduler()) {
  const log: Array<[number, number]> = []; // [time, value]
  const c = new Countdown(deadlineAt, (v) => log.push([s.time, v]), s);
  return { s, c, log, values: () => log.map((e) => e[1]) };
}

describe('pure helpers', () => {
  it('secondsRemaining rounds up and never goes negative', () => {
    expect(secondsRemaining(5000, 0)).toBe(5);
    expect(secondsRemaining(5000, 1)).toBe(5);
    expect(secondsRemaining(5000, 999)).toBe(5);
    expect(secondsRemaining(5000, 1000)).toBe(4);
    expect(secondsRemaining(5000, 5000)).toBe(0);
    expect(secondsRemaining(5000, 9000)).toBe(0);
  });
  it('msUntilNextChange points exactly at the next change', () => {
    expect(msUntilNextChange(5000, 0)).toBe(1000);
    expect(msUntilNextChange(5000, 400)).toBe(600);
    expect(msUntilNextChange(2500, 0)).toBe(500);
    expect(msUntilNextChange(5000, 5000)).toBe(-1);
    expect(msUntilNextChange(5000, 6000)).toBe(-1);
  });
  it('estimateDeadlineAt uses the midpoint of the request', () => {
    expect(estimateDeadlineAt(1000, 1200, 10)).toBe(1100 + 10000);
    expect(estimateDeadlineAt(1000, 1000, 0)).toBe(1000);
  });
});

describe('Countdown', () => {
  it('counts 5,4,3,2,1,0 with no skips or repeats, once per second', () => {
    const { s, c, log } = run(5000);
    c.start();
    s.advance(10000);
    expect(log).toEqual([[0, 5], [1000, 4], [2000, 3], [3000, 2], [4000, 1], [5000, 0]]);
  });

  it('keeps exactly one timer pending and none after reaching 0', () => {
    const { s, c } = run(3000);
    c.start();
    expect(s.pending).toBe(1);
    s.advance(1000);
    expect(s.pending).toBe(1);
    s.advance(2000);
    expect(s.pending).toBe(0);
  });

  it('handles fractional starts by ticking when the number really changes', () => {
    const { s, c, log } = run(2500);
    c.start();
    s.advance(3000);
    expect(log).toEqual([[0, 3], [500, 2], [1500, 1], [2500, 0]]);
  });

  it('starting at or after the deadline emits 0 once and schedules nothing', () => {
    const past = run(-5000);
    past.c.start();
    expect(past.values()).toEqual([0]);
    expect(past.s.pending).toBe(0);
  });

  it('is exact after a throttled/late timer (clock jump, no drift)', () => {
    const { s, c, values } = run(10000);
    c.start();
    s.jump(3500); // background tab: one late callback
    expect(values()).toEqual([10, 7]);
    s.advance(1000);
    expect(values()).toEqual([10, 7, 6]); // next change at 4000 → ...
  });

  it('does not emit twice if a timer fires a hair early', () => {
    const { s, c, values } = run(3000);
    c.start();
    s.jump(999); // 1 ms early, not yet due -> nothing fires
    expect(values()).toEqual([3]);
    s.advance(1);
    expect(values()).toEqual([3, 2]);
  });

  it('pauses while hidden (no timers) and resyncs when visible', () => {
    const { s, c, values } = run(10000);
    c.start();
    c.setHidden(true);
    expect(s.pending).toBe(0);
    s.advance(4200);
    expect(values()).toEqual([10]); // no work done while hidden
    c.setHidden(false);
    expect(values()).toEqual([10, 6]); // recomputed from the clock
    expect(s.pending).toBe(1);
  });

  it('may start while hidden: emits once, schedules nothing until visible', () => {
    const { s, c, values } = run(5000);
    c.setHidden(true);
    c.start();
    expect(values()).toEqual([5]);
    expect(s.pending).toBe(0);
    s.advance(2000);
    c.setHidden(false);
    expect(values()).toEqual([5, 3]);
  });

  it('stop() cancels the timer and silences further ticks', () => {
    const { s, c, values } = run(5000);
    c.start();
    c.stop();
    expect(s.pending).toBe(0);
    s.advance(6000);
    c.setHidden(true);
    c.setHidden(false);
    expect(values()).toEqual([5]);
  });

  it('stop() called from inside the tick callback is respected', () => {
    const s = new FakeScheduler();
    const seen: number[] = [];
    const c: Countdown = new Countdown(5000, (v) => { seen.push(v); if (v === 4) c.stop(); }, s);
    c.start();
    s.advance(6000);
    expect(seen).toEqual([5, 4]);
    expect(s.pending).toBe(0);
  });

  it('instances are independent', () => {
    const s = new FakeScheduler();
    const a: number[] = [], b: number[] = [];
    new Countdown(2000, (v) => a.push(v), s).start();
    new Countdown(3000, (v) => b.push(v), s).start();
    s.advance(4000);
    expect(a).toEqual([2, 1, 0]);
    expect(b).toEqual([3, 2, 1, 0]);
  });
});

describe('Countdown with the real clock', () => {
  it('counts 3,2,1,0 in real time, each change within 60 ms of its boundary', async () => {
    const start = browserScheduler.now();
    const log: Array<[number, number]> = [];
    const c = new Countdown(start + 3000, (v) => log.push([browserScheduler.now() - start, v]));
    c.start();
    await new Promise((r) => setTimeout(r, 3300));
    c.stop();
    expect(log.map((e) => e[1])).toEqual([3, 2, 1, 0]);
    [0, 1000, 2000, 3000].forEach((boundary, i) => {
      const late = log[i][0] - boundary;
      expect(late).toBeLessThan(60);
      expect(late).toBeGreaterThan(-5);
    });
  }, 10000);
});
