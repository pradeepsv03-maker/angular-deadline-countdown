import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeadlineService } from './deadline.service';

describe('DeadlineService', () => {
  let svc: DeadlineService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(DeadlineService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('GETs /api/deadline and returns secondsLeft', (done) => {
    svc.getSecondsLeft().subscribe((v) => { expect(v).toBe(42); done(); });
    const req = http.expectOne('/api/deadline');
    expect(req.request.method).toBe('GET');
    req.flush({ secondsLeft: 42 });
  });
  it('rounds up fractions and clamps negatives to 0', () => {
    const out: number[] = [];
    svc.getSecondsLeft().subscribe((v) => out.push(v));
    http.expectOne('/api/deadline').flush({ secondsLeft: 9.2 });
    svc.getSecondsLeft().subscribe((v) => out.push(v));
    http.expectOne('/api/deadline').flush({ secondsLeft: -5 });
    expect(out).toEqual([10, 0]);
  });
});
