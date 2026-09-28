import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  NgZone,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subscription,
  catchError,
  distinctUntilChanged,
  map,
  takeWhile,
  timer,
} from 'rxjs';
import { DeadlineService } from './deadline.service';

@Component({
  selector: 'app-countdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error) {
      <p role="alert">
        Could not load the deadline.
        <button type="button" (click)="load()">Try again</button>
      </p>
    } @else if (secondsLeft === null) {
      <p>Loading…</p>
    } @else {
      <p aria-live="off">Seconds left to deadline: {{ secondsLeft }}</p>
    }
  `,
})
export class CountdownComponent implements OnInit {
  private readonly deadlineService = inject(DeadlineService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  secondsLeft: number | null = null;
  error = false;

  private reqSub?: Subscription;
  private tickSub?: Subscription;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error = false;
    // Guard against overlapping loads (e.g. repeated retries).
    this.reqSub?.unsubscribe();
    this.tickSub?.unsubscribe();

    // One single HTTP request; everything after that is computed locally.
    this.reqSub = this.deadlineService
      .getSecondsLeft()
      .pipe(
        catchError(() => {
          this.error = true;
          this.cdr.markForCheck();
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((seconds) => this.startCountdown(seconds));
  }

  private startCountdown(initialSeconds: number): void {
    // performance.now() is monotonic: unaffected by system clock changes.
    const deadlineAt = performance.now() + initialSeconds * 1000;
    this.secondsLeft = initialSeconds;
    this.cdr.markForCheck();

    // The timer runs outside NgZone so each tick does not trigger a
    // change detection pass over the whole application.
    this.zone.runOutsideAngular(() => {
      this.tickSub = timer(0, 1000)
        .pipe(
          // Derive the value from the clock instead of decrementing, so
          // throttled background tabs never make the countdown drift.
          map(() => Math.max(0, Math.ceil((deadlineAt - performance.now()) / 1000))),
          distinctUntilChanged(),
          takeWhile((s) => s > 0, true), // emit 0, then complete: no idle timer
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((s) => {
          this.secondsLeft = s;
          // Re-render only this component, not the whole tree.
          this.cdr.detectChanges();
        });
    });
  }
}
