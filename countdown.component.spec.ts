import { ApplicationRef, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CountdownComponent } from './countdown.component';

describe('CountdownComponent', () => {
  let fixture: ComponentFixture<CountdownComponent>;
  let http: HttpTestingController;
  let clock: number;

  const text = () => fixture.nativeElement.textContent.trim();
  /** Advances both the fake timers and the mocked monotonic clock. */
  const advance = (ms: number) => { clock += ms; tick(ms); };
  const respond = (secondsLeft: number) => http.expectOne('/api/deadline').flush({ secondsLeft });

  beforeEach(() => {
    clock = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    TestBed.configureTestingModule({
      imports: [CountdownComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CountdownComponent);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows a loading state until the API responds', fakeAsync(() => {
    fixture.detectChanges();
    expect(text()).toContain('Loading');
    respond(3);
    tick(0);
    advance(3000);
  }));

  it('displays "Seconds left to deadline: X" with the value from the API', fakeAsync(() => {
    fixture.detectChanges();
    respond(5);
    tick(0);
    expect(text()).toBe('Seconds left to deadline: 5');
    advance(5000);
  }));

  it('updates every second', fakeAsync(() => {
    fixture.detectChanges();
    respond(5);
    tick(0);
    for (const expected of [4, 3, 2, 1, 0]) {
      advance(1000);
      expect(text()).toBe(`Seconds left to deadline: ${expected}`);
    }
  }));

  it('calls the backend exactly once', fakeAsync(() => {
    fixture.detectChanges();
    respond(10);
    tick(0);
    advance(10000);
    http.verify(); // fails if any other request was made
  }));

  it('stops at 0, never goes negative, and leaves no timers running', fakeAsync(() => {
    fixture.detectChanges();
    respond(2);
    tick(0);
    advance(2000);
    expect(text()).toBe('Seconds left to deadline: 0');
    advance(5000);
    expect(text()).toBe('Seconds left to deadline: 0');
    // fakeAsync throws at the end of the test if a periodic timer is still pending
  }));

  it('handles 0 seconds left immediately', fakeAsync(() => {
    fixture.detectChanges();
    respond(0);
    tick(0);
    expect(text()).toBe('Seconds left to deadline: 0');
  }));

  it('does not drift when timers are throttled (background tab)', fakeAsync(() => {
    fixture.detectChanges();
    respond(60);
    tick(0);
    clock += 7300;           // browser was asleep for 7.3s of real time
    tick(1000);              // first timer callback fires late
    expect(text()).toBe('Seconds left to deadline: 53'); // 60 - 7.3 = 52.7 -> 53
    clock += 100000;         // jump well past the deadline
    tick(1000);
    expect(text()).toBe('Seconds left to deadline: 0');
  }));

  it('does not trigger app-wide change detection on each tick', fakeAsync(() => {
    const zone = TestBed.inject(NgZone);
    fixture.detectChanges();
    respond(5);
    tick(0);
    let stable = 0;
    const sub = zone.onMicrotaskEmpty.subscribe(() => stable++);
    advance(4000);
    expect(stable).toBe(0);
    expect(text()).toBe('Seconds left to deadline: 1');
    sub.unsubscribe();
    advance(1000);
  }));

  it('shows an error and retries successfully', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne('/api/deadline').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('Could not load the deadline');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    respond(4);
    tick(0);
    expect(text()).toBe('Seconds left to deadline: 4');
    advance(4000);
  }));

  it('cleans up timers and requests when destroyed mid-countdown', fakeAsync(() => {
    fixture.detectChanges();
    respond(30);
    tick(0);
    advance(2000);
    fixture.destroy();
    // if the timer were still alive, fakeAsync would throw "periodic timer(s) still in the queue"
    expect(() => advance(5000)).not.toThrow();
  }));

  it('cancels a pending request when destroyed before the response', fakeAsync(() => {
    fixture.detectChanges();
    const req = http.expectOne('/api/deadline');
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  }));
});
