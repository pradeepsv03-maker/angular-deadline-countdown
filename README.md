# Deadline countdown (Angular 17+)

`GET /api/deadline` → `{ secondsLeft }`, rendered as **"Seconds left to deadline: X"**, updated every second.

## Use
Copy `src/countdown.ts`, `src/deadline.service.ts`, `src/countdown.component.ts` into your project, add `provideHttpClient()` to your app config, and use `<app-countdown />`.

## Files
| File | Role |
|---|---|
| `countdown.ts` | Framework-free timing engine (no Angular, no RxJS). All timing logic; unit-tested with a fake clock. |
| `deadline.service.ts` | Fetches the deadline once per app, shares/caches it, converts it to a monotonic deadline. |
| `countdown.component.ts` | Thin standalone `OnPush` view. |

## Performance decisions
- **One HTTP request per app.** The deadline never changes, so the service caches it (`shareReplay`); any number of components share it. A failed request is not cached (retry works).
- **Deadline, not counter.** The value is computed from `performance.now()` (monotonic), so tab throttling, timer jitter and system-clock changes cannot cause drift.
- **One timer, scheduled for the exact moment the number changes** (not a fixed `setInterval(1000)`): no drift, no wasted or duplicate ticks, and nothing scheduled after 0.
- **Paused while the tab is hidden**; recomputed in a single step when it becomes visible.
- **Outside NgZone + `OnPush` + `detectChanges()`** on this component only: a tick never triggers an app-wide change-detection pass.
- **Latency compensation:** the server's answer is anchored to the midpoint of the request, removing about half the round-trip from the countdown.
- **SSR-safe:** no request and no timers on the server (they would keep the app from stabilising).
- Rejects invalid payloads (non-finite `secondsLeft`); shows loading and error-with-retry states; clamps at 0.

## Tests
`npm test` (Jest + `jest-preset-angular`)

| Spec | Covers |
|---|---|
| `countdown.spec.ts` | Engine: 5→0 with no skips/repeats, exactly one pending timer, none after 0, fractional starts, past deadline, throttled-tab clock jump, early timer, hidden/visible, stop (also from inside callback), independent instances, real 3-second wall-clock run |
| `deadline.service.spec.ts` | One request shared and cached, latency midpoint, invalid payload, failure not cached |
| `countdown.component.spec.ts` | Text and per-second updates, no timer left at 0/destroy, throttled tab, no app-wide CD, loading, error + retry, visibility pause |
