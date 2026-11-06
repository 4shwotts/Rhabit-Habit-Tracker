# Testing

Rhabit is tested at four levels, from fast checks of single functions up to a real browser using the whole app. Every push and pull request runs all of them on GitHub Actions.

## Results

| Level | Tool | Where | Tests | Time |
|---|---|---|---|---|
| Unit | Vitest | `server/tests/unit/` | 89 | seconds |
| Frontend component | Vitest, Testing Library | `src/components/*.test.jsx` | 15 | seconds |
| Image sizes | Vitest | `src/assets/assets.test.js` | 32 | seconds |
| API integration | Vitest, Supertest | `server/tests/api/` | 171 | about 30s |
| End-to-end and accessibility | Playwright, axe | `e2e/` | 7 | about 3 minutes |
| **Total** | | | **314** | |

| Coverage | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Server (unit and API tests) | 87.32% | 68.43% | 89.55% | 90.01% |
| Frontend (component tests only) | 23.78% | 24.96% | 18.77% | 24.62% |

The frontend figure counts component tests only. The end-to-end journeys use most of the frontend, but they run in a real browser and aren't included in that number.

## Strategy

The game's rules are enforced on the server, so most tests sit there. A rule such as "confirm needs every task ticked" is tested against the API, which holds whatever the browser does.

- **Unit tests** cover the pure game logic in `lib/game.js`: XP, levels, tier unlocks and window lengths. Fake timers cover midnight, clock changes and time zones. Edge cases include zero, negative, huge and missing values. The safety tests described below are here too.
- **Component tests** cover the Home window timer and penalty pop-up with a fake clock. Timing bugs are hard to reach any other way, for example a page that loads just after a window ended.
- **API tests** send real HTTP requests to the real app and a real Postgres database. The server's clock is fixed at the same morning time for every test, because the rules change late in the day:

  | File | Tests | Covers |
  |---|---|---|
  | `auth` | 31 | sign-up, verification, login, logout, bad sessions, password reset |
  | `security` | 28 | SQL injection, client-set values, cross-site writes, headers |
  | `validation` | 23 | bad input gets a clean 400, never a stack trace |
  | `two-factor` | 20 | setup, sign-in, replayed codes, backup codes, bypass attempts |
  | `authorisation` | 17 | one player against another's data always gets a 404 |
  | `game` | 46 | window, ticks, XP, level cap, finished pathways, penalties, rerolls, late-day rules, missed days, pausing, midnight reset by time zone |
  | `rate-limits` | 6 | 429 on repeated logins, sign-ups, reset emails and overall traffic |

- **End-to-end tests** drive Chromium through the main journeys, on a stack that uses 30-second windows so a full day fits in a test:
  1. sign up, verify, set up, complete a day, log out, log back in and find the XP still there
  2. a wrong password, then the forgotten-password flow
  3. a missed window, a penalty, a missed penalty, and the XP lost (each request sent exactly once)
  4. a started day left unfinished, and the XP loss shown on the next visit
  5. the longest confirm label fits inside its button
  6. add, rename and delete a goal
- **Accessibility:** axe scans login, sign-up, setup, Home and Goals against WCAG 2.1 A and AA. Any violation fails the run.
- **Image sizes:** every image and icon must stay under 200 kB, so a heavy file can't quietly slow the first load again.

## Keeping tests away from real data

- `NODE_ENV=test` stops the server reading `server/.env`, which points at the real database.
- Tests only ever use `TEST_DATABASE_URL` or a local throwaway database. `DATABASE_URL` is ignored, and hosted database URLs such as Neon are refused before any test starts.
- Test helpers only work when `NODE_ENV=test`: the email outbox, the fake mail-server lookup, the rate limit reset and the `/api/test` routes. Tests confirm those routes answer 404 in development and production, and that the hosted-database refusal stops a whole run.
- No test sends a real email or needs the network.

## Deliberately not tested

| Not tested | Why |
|---|---|
| How pages look | There's no visual regression testing, because the animated background and glass effects would make screenshots unreliable. Only one layout rule, the confirm button label, has a test. |
| Other browsers and phones | Chromium only, to keep the suite fast. Responsive layouts are checked by hand. |
| Real email delivery | Sending through Brevo would need a live account and could spam real inboxes. Tests read an in-memory outbox instead. |
| Real mail-server (MX) lookups | The lookup is faked so tests never depend on the network. |
| Production hosting | Vercel rewrites, security headers set by Vercel, and the Render and Neon setup aren't covered. |
| Load and performance | Not needed at this scale. |
| The canvas background | It's decorative and has no game logic. |
| Real window lengths in a browser | End-to-end tests use the 30-second timers. Unit and API tests use the real values. |

## Running the tests on Windows

You need Node.js 24 and npm. You don't need Postgres or Docker: the tests start their own throwaway database. Run these from PowerShell in the repo folder.

First time only:

```powershell
npm install
npm install --prefix server
npx playwright install chromium
```

Then:

```powershell
npm test                  # component, unit and API tests
npm run test:coverage     # the same, with coverage reports
npm run test:e2e          # end-to-end tests and accessibility scan
npx playwright show-report
npm run lint
```

Coverage reports are written to `coverage/` and `server/coverage/`. Accessibility results are in `test-results/accessibility.json`.

The end-to-end tests start their own frontend, API and database, and never reuse a running dev server.

| If you see | Do this |
|---|---|
| An error about port 5434 | Something is using the API tests' database port. Stop it and run again. |
| An error about port 3011, 5181 or 5435 | The same, for the end-to-end stack. |
| `EPERM` on `rhabit-e2e-pg` after Ctrl+C | Harmless. The run was stopped during clean-up, and the next run clears the folder. |
| `Postgres pool error: read ECONNRESET` at the end | Harmless. The test API noticed the database shutting down. |

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs install, lint, tests with coverage, build, and the end-to-end tests, against a Postgres service that exists only for that run. Coverage reports, the Playwright HTML report and test results are uploaded as artifacts and kept for 14 days.

Three optional Actions secrets replace the test-only values: `TEST_DB_PASSWORD`, `TEST_JWT_SECRET` and `TEST_TOTP_KEY`. CI passes without them, so forks work too. They should always be made-up test values, never production ones.
