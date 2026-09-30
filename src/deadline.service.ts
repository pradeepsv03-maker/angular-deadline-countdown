import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, defer, map, shareReplay } from 'rxjs';
import { estimateDeadlineAt } from './countdown';

export interface DeadlineResponse {
  secondsLeft: number;
}

@Injectable({ providedIn: 'root' })
export class DeadlineService {
  private readonly http = inject(HttpClient);

  /**
   * The deadline never changes, so it is fetched at most once per app and
   * shared by every component instance. It is exposed as an absolute point
   * on the monotonic clock (performance.now() scale), so a component created
   * later still computes the right remaining time from the cached value.
   * A failed request is not cached: the next subscription retries.
   */
  private readonly deadlineAt$: Observable<number> = defer(() => {
    const t0 = performance.now();
    return this.http.get<DeadlineResponse>('/api/deadline').pipe(
      map(({ secondsLeft }) => {
        if (typeof secondsLeft !== 'number' || !Number.isFinite(secondsLeft)) {
          throw new Error('Invalid /api/deadline response');
        }
        return estimateDeadlineAt(t0, performance.now(), secondsLeft);
      }),
    );
  }).pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getDeadlineAt(): Observable<number> {
    return this.deadlineAt$;
  }
}
