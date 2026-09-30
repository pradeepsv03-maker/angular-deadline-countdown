import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  NgZone,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { Countdown } from './countdown';
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
  private readonly service = inject(DeadlineService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  secondsLeft: number | null = null;
  error = false;

  private request?: Subscription;
  private countdown?: Countdown;
  private removeVisibilityListener?: () => void;

  ngOnInit(): void {
    // Server-side rendering: no request and no timers (they would keep the
    // app from ever becoming stable). The browser takes over after hydration.
    if (this.isBrowser) this.load();
    this.destroyRef.onDestroy(() => this.teardown());
  }

  load(): void {
    this.teardown();
    this.error = false;
    this.secondsLeft = null;
    this.request = this.service
      .getDeadlineAt()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deadlineAt) => this.start(deadlineAt),
        error: () => {
          this.error = true;
          this.cdr.markForCheck();
        },
      });
  }

  private start(deadlineAt: number): void {
    // Everything below runs outside NgZone: a tick must not trigger a
    // change-detection pass over the whole application.
    this.zone.runOutsideAngular(() => {
      // The first tick can be synchronous (cached deadline) while Angular is
      // still inside a change-detection pass, so it only marks the view.
      let firstTick = true;
      this.countdown = new Countdown(deadlineAt, (seconds) => {
        this.secondsLeft = seconds;
        if (firstTick) this.cdr.markForCheck();
        else this.cdr.detectChanges(); // re-render only this component
      });

      const onVisibility = () => this.countdown?.setHidden(this.doc.hidden);
      this.doc.addEventListener('visibilitychange', onVisibility);
      this.removeVisibilityListener = () =>
        this.doc.removeEventListener('visibilitychange', onVisibility);

      this.countdown.setHidden(this.doc.hidden);
      this.countdown.start();
      firstTick = false;
    });
  }

  private teardown(): void {
    this.request?.unsubscribe();
    this.countdown?.stop();
    this.removeVisibilityListener?.();
    this.request = this.countdown = this.removeVisibilityListener = undefined;
  }
}
