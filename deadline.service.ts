import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface DeadlineResponse {
  secondsLeft: number;
}

@Injectable({ providedIn: 'root' })
export class DeadlineService {
  private readonly http = inject(HttpClient);

  /** Fetches the number of seconds left to the (constant) deadline. */
  getSecondsLeft(): Observable<number> {
    return this.http
      .get<DeadlineResponse>('/api/deadline')
      .pipe(map(({ secondsLeft }) => Math.max(0, Math.ceil(secondsLeft))));
  }
}
