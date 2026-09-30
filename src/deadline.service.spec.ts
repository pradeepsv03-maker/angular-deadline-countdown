import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeadlineService } from './deadline.service';

describe('DeadlineService', () => {
  let service: DeadlineService;
  let http: HttpTestingController;
  let clock: number;

  beforeEach(() => {
    clock = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DeadlineService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); jest.restoreAllMocks(); });

  it('GETs /api/deadline once, shared by all subscribers, and caches the result', () => {
    const got: number[] = [];
    service.getDeadlineAt().subscribe((v) => got.push(v));
    service.getDeadlineAt().subscribe((v) => got.push(v));
    const req = http.expectOne('/api/deadline');
    expect(req.request.method).toBe('GET');
    clock = 1200; // 200 ms round trip
    req.flush({ secondsLeft: 10 });
    service.getDeadlineAt().subscribe((v) => got.push(v)); // later subscriber: no new request
    expect(got).toEqual([11100, 11100, 11100]); // 1100 (midpoint) + 10 s
  });

  it('rejects invalid payloads', () => {
    let error: unknown;
    service.getDeadlineAt().subscribe({ error: (e) => (error = e) });
    http.expectOne('/api/deadline').flush({ secondsLeft: 'soon' });
    expect(error).toBeInstanceOf(Error);
  });

  it('does not cache a failure: the next subscription retries', () => {
    service.getDeadlineAt().subscribe({ error: () => undefined });
    http.expectOne('/api/deadline').flush('boom', { status: 500, statusText: 'Server Error' });
    let value = 0;
    service.getDeadlineAt().subscribe((v) => (value = v));
    http.expectOne('/api/deadline').flush({ secondsLeft: 5 });
    expect(value).toBe(6000);
  });
});
