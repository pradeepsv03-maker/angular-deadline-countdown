/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:45871/"}
 */
import * as http from 'http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { CountdownComponent } from './countdown.component';
import { DeadlineService } from './deadline.service';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Integration: real HTTP server + real wall-clock time', () => {
  let server: http.Server;
  let hits = 0;
  const deadline = () => Date.now() + 4500; // fixed constant deadline, like the real API

  beforeAll((done) => {
    const fixed = deadline();
    server = http.createServer((req, res) => {
      if (req.url === '/api/deadline') {
        hits++;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ secondsLeft: (fixed - Date.now()) / 1000 }));
      } else { res.statusCode = 404; res.end(); }
    }).listen(45871, done);
  });
  afterAll((done) => { server.close(done); });

  it('fetches once, ticks down every real second, reaches 0 and stops', async () => {
    TestBed.configureTestingModule({ imports: [CountdownComponent], providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(CountdownComponent);
    fixture.detectChanges();
    const seen: number[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 6500) {
      const m = /X|(\d+)$/.exec(fixture.nativeElement.textContent.trim());
      const v = m && m[1] !== undefined ? +m[1] : null;
      if (v !== null && seen[seen.length - 1] !== v) seen.push(v);
      await wait(50);
    }
    console.log('observed values:', seen.join(','));
    expect(seen[0]).toBeGreaterThanOrEqual(4);
    expect(seen[seen.length - 1]).toBe(0);
    // strictly decreasing by exactly 1 each step (every second, no skips)
    for (let i = 1; i < seen.length; i++) expect(seen[i - 1] - seen[i]).toBe(1);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(hits).toBe(1);
    fixture.destroy();
  }, 15000);
});

describe('Component contract', () => {
  it('uses OnPush change detection and is standalone', () => {
    const def = (CountdownComponent as any).ɵcmp;
    expect(def.onPush).toBe(true);
    expect(def.standalone).toBe(true);
  });

  it('overlapping load() calls do not create duplicate timers/requests', () => {
    jest.useFakeTimers();
    const subject = new Subject<number>();
    let calls = 0, unsub = 0;
    TestBed.configureTestingModule({
      imports: [CountdownComponent],
      providers: [{ provide: DeadlineService, useValue: { getSecondsLeft: () => { calls++; return new Observable<number>((o) => { const s = subject.subscribe(o as any); return () => { unsub++; s.unsubscribe(); }; }); } } }],
    });
    const f = TestBed.createComponent(CountdownComponent);
    f.detectChanges();
    f.componentInstance.load();
    f.componentInstance.load();
    expect(calls).toBe(3);
    expect(unsub).toBe(2); // earlier in-flight requests were cancelled
    f.destroy();
    expect(unsub).toBe(3);
    jest.useRealTimers();
  });

  it('two instances count independently', async () => {
    const svc = { getSecondsLeft: () => new Observable<number>((o) => { o.next(3); o.complete(); }) };
    TestBed.configureTestingModule({ imports: [CountdownComponent], providers: [{ provide: DeadlineService, useValue: svc }] });
    const a = TestBed.createComponent(CountdownComponent), b = TestBed.createComponent(CountdownComponent);
    a.detectChanges(); b.detectChanges();
    await wait(1100);
    a.destroy();
    await wait(1100);
    expect(b.nativeElement.textContent).toContain(': 1');
    b.destroy();
  });
});
