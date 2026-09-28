# Deadline countdown (Angular 17+)

Copy `deadline.service.ts` and `countdown.component.ts` into your project and use `<app-countdown />`.
Requires `provideHttpClient()` in your app config.

Design choices
- One HTTP call (`GET /api/deadline`), then the countdown is computed locally.
- Value is derived from `performance.now()` rather than decremented, so it stays accurate when the tab is throttled or the system clock changes.
- Timer runs outside NgZone and only this component is re-rendered (`OnPush` + `detectChanges`).
- Timer completes at 0 (never negative); `distinctUntilChanged` avoids redundant renders.
- Subscriptions are cleaned up with `takeUntilDestroyed`; loading and error (with retry) states included.

## Tests (17, all passing)
Run with Jest (`jest-preset-angular`, see `jest.config.js`). Also verified with a strict AOT compile (`ngc -p tsconfig.aot.json`, `strictTemplates`) on Angular 17 and 19.

| Requirement | Verified by |
|---|---|
| Retrieves data from `/api/deadline` | service spec + real HTTP server integration test |
| Shows "Seconds left to deadline: X" | component spec |
| X updates every second | fake-clock test and a real 5-second wall-clock run (5,4,3,2,1,0, no skips) |
| Performance: single request | `http.verify()` and server hit counter = 1 |
| Performance: OnPush, standalone | contract test |
| Performance: no app-wide change detection per tick | `onMicrotaskEmpty` never fires |
| Correct when tab throttled | clock-jump test |
| Stops at 0, never negative, no idle timer | fakeAsync pending-timer check |
| Cleanup (destroy, cancel in-flight request, overlapping loads) | component specs |
| Error handling and retry | component spec |
| Multiple instances independent | contract test |
| Copy-paste into other projects | strict AOT compile on Angular 17 and 19 |
