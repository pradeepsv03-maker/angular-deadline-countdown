import { ApplicationRef, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { CountdownComponent } from './countdown.component';
import { DeadlineService } from './deadline.service';

describe('CountdownComponent', () => {
  let fixture: ComponentFixture<CountdownComponent>;
  let clock: number;
  let deadline$: () => Observable<number>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent!.trim();
  /** Moves the mocked monotonic clock and the fake timers together. */
  const advance = (ms: number) => { clock += ms; tick(ms); };

  function create(): void {
    TestBed.configureTestingModule({
      imports: [CountdownComponent],
      providers: [{ provide: DeadlineService, useValue: { getDeadlineAt: () => deadline$() } }],
    });
    fixture = TestBed.createComponent(CountdownComponent);
  }

  beforeEach(() => {
    clock = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    deadline$ = () => of(clock + 5000);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows "Seconds left to deadline: X" and updates every second down to 0', fakeAsync(() => {
    create();
    fixture.detectChanges();
    expect(text()).toBe('Seconds left to deadline: 5');
    for (const expected of [4, 3, 2, 1, 0]) {
      advance(1000);
      expect(text()).toBe(`Seconds left to deadline: ${expected}`);
    }
  }));

  it('leaves no timer running once it reaches 0 (fakeAsync would fail otherwise)', fakeAsync(() => {
    create();
    fixture.detectChanges();
    advance(5000);
  }));

  it('is correct after a throttled tab (clock jumps, timer fires late)', fakeAsync(() => {
    create();
    fixture.detectChanges();
    clock += 3500;
    tick(3500);
    expect(text()).toBe('Seconds left to deadline: 2');
    advance(2000);
  }));

  it('ticks do not trigger application-wide change detection', fakeAsync(() => {
    create();
    fixture.detectChanges();
    let appTicks = 0;
    const sub = TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(() => appTicks++);
    const appRef = TestBed.inject(ApplicationRef);
    const spy = jest.spyOn(appRef, 'tick');
    advance(5000);
    expect(appTicks).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    sub.unsubscribe();
  }));

  it('shows loading until the deadline arrives', fakeAsync(() => {
    deadline$ = () => new Observable<number>(); // never emits
    create();
    fixture.detectChanges();
    expect(text()).toContain('Loading');
  }));

  it('shows an error and retries on click', fakeAsync(() => {
    let fail = true;
    deadline$ = () => (fail ? throwError(() => new Error('x')) : of(clock + 3000));
    create();
    fixture.detectChanges();
    expect(text()).toContain('Could not load the deadline');
    fail = false;
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).toBe('Seconds left to deadline: 3');
    advance(3000);
  }));

  it('cancels the timer when destroyed', fakeAsync(() => {
    create();
    fixture.detectChanges();
    fixture.destroy(); // a leftover timer would make fakeAsync throw
  }));

  it('pauses while the page is hidden and resyncs when visible', fakeAsync(() => {
    create();
    fixture.detectChanges();
    const hidden = jest.spyOn(Document.prototype, 'hidden', 'get');
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    clock += 3000;
    tick(3000);
    expect(text()).toBe('Seconds left to deadline: 5'); // no work while hidden
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(text()).toBe('Seconds left to deadline: 2');
    advance(2000);
  }));
});
