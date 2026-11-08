# Testing

Rhabit is tested at four levels, from fast checks of single functions up to a real browser using the whole app. Every push and pull request runs all of them on GitHub Actions.

## Results

| Level | Tool | Where | Tests | Time |
|---|---|---|---|---|
| Unit | Vitest | `server/tests/unit/` | 103 | seconds |
| Component | Vitest, Testing Library | `src/components/**/*.test.jsx` | 49 | seconds |
| Image sizes | Vitest | `src/assets/assets.test.js` | 32 | seconds |
| API integration | Vitest, Supertest | `server/tests/api/` | 235 | about 45s |
| Browser journeys | Playwright | `e2e/journeys.spec.js`, `e2e/demo.spec.js` | 9 | about 2 minutes |
| Accessibility | Playwright, axe | `e2e/accessibility.spec.js` | 1 | seconds |
| Phone checks | Playwright | `e2e/phones.spec.js` | 16 | about 4 minutes |
| **Total** | | | **445** | |

The phone checks are 2 tests at each of 4 sizes, in Chromium and WebKit.

| Coverage | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Server (unit and API tests) | 88.36% | 68.53% | 90.54% | 90.76% |
| Frontend (component tests only) | 33.95% | 33.98% | 28.52% | 35.55% |

The frontend figure counts component tests only. The end-to-end journeys use most of the frontend, but they run in a real browser and aren't included in that number.

## Strategy

The game's rules are enforced on the server, so most tests sit there. A rule such as "confirm needs every task ticked" is tested against the API, which holds whatever the browser does.

- **Unit tests** (103) cover the pure game logic in `lib/game.js` (83): XP, levels, tier unlocks and window lengths. They also cover demo accounts in `lib/demo.js` (14): the seed every demo starts with, when a demo expires, its address, and its fast timers. Fake timers cover midnight, clock changes and time zones. Edge cases include zero, negative, huge and missing values. The 6 safety tests described below are here too.
- **Component tests** (49) use a fake clock and stand-ins for the API:

  | File | Tests | Covers |
  |---|---|---|
  | `HomePage` | 17 | the window timer and penalty pop-up, including a page that loads just after a window ended |
  | `legal` | 15 | the privacy notice and disclaimer render without logging in, read correctly with sign-up open or closed, and are linked from login, sign-up and Settings |
  | `ServerStatus` | 12 | a sleeping server: the waking message after 2 seconds and not before, giving up after 75 seconds, and Retry on the login page, the `/demo` page and the start-up screen |
  | `SignupPage` | 5 | the sign-up page with sign-up open, and closed: still on show, every field disabled, and a link to the demo |

- **API tests** send real HTTP requests to the real app and a real Postgres database. The server's clock is fixed at the same morning time for every test, because the rules change late in the day:

  | File | Tests | Covers |
  |---|---|---|
  | `auth` | 31 | sign-up, verification, login, logout, bad sessions, password reset |
  | `security` | 28 | SQL injection, client-set values, cross-site writes, headers |
  | `validation` | 23 | bad input gets a clean 400, never a stack trace |
  | `two-factor` | 20 | setup, sign-in, replayed codes, backup codes, bypass attempts |
  | `authorisation` | 17 | one player against another's data always gets a 404 |
  | `game` | 49 | window, ticks, XP, level cap, finished pathways, penalties, rerolls, late-day rules, missed days, pausing, midnight reset by time zone |
  | `demo` | 38 | starting a demo, seeded data, fast timers for demos only, demos kept apart (404), clean-up of expired demos with all their rows and never a real account, 429 per IP, the cap on live demos, every restricted action (403), ending a demo |
  | `signup-switch` | 17 | the same checks with sign-up on and off: the 403 when off, the form token, and existing accounts still logging in, resetting passwords, verifying email and using 2FA |
  | `rate-limits` | 6 | 429 on repeated logins, sign-ups, reset emails and overall traffic |
  | `wake` | 6 | `/api/wake` runs one database query, answers 503 if the database fails, is rate-limited and only answers GET; `/api/health` never touches the database |
  | **Total** | **235** | |

- **Browser journeys** (9) drive Chromium through the main journeys, on a stack that uses 30-second windows so a full day fits in a test:
  1. sign up, verify, set up, complete a day, log out, log back in and find the XP still there
  2. a wrong password, then the forgotten-password flow
  3. a missed window, a penalty, a missed penalty, and the XP lost (each request sent exactly once)
  4. a started day left unfinished, and the XP loss shown on the next visit
  5. the longest confirm label fits inside its button
  6. add, rename and delete a goal
  7. try the demo, complete the day, then end the demo and check the account is gone
  8. the `/demo` link starts a demo and goes straight to Home, and a refresh carries on in the same demo
  9. let a demo window run out and see the 2-minute penalty start
- **Phone checks** (16): every main page, including the privacy notice and disclaimer, is opened at 320 by 568, 390 by 844, 844 by 390 and 768 by 1024 with touch on, in Chromium and in WebKit, the engine behind Safari. Nothing may run off the sides of the screen, Home and Goals must fit an upright screen without scrolling, and a long list of goals must scroll inside the Goals frame. A second test at each size starts the demo: the login button, Home, Settings and Goals must fit, and the demo banner must never cover the clock or the top buttons.
- **Accessibility** (1 scan): axe checks login (with the demo button), sign-up, setup, Home and Goals, demo mode's Home with its banner and Settings, and the privacy notice and disclaimer (reached from the login page without logging in), against WCAG 2.1 A and AA. Any violation fails the run.
- **Image sizes:** every image and icon must stay under 200 kB, so a heavy file can't quietly slow the first load again.

## Keeping tests away from real data

- `NODE_ENV=test` stops the server reading `server/.env`, which points at the real database.
- Tests only ever use `TEST_DATABASE_URL` or a local throwaway database. `DATABASE_URL` is ignored, and hosted database URLs such as Neon are refused before any test starts.
- Test helpers only work when `NODE_ENV=test`: the email outbox, the fake mail-server lookup, the rate limit reset and the `/api/test` routes, including the ones the demo journeys use to move a demo's window on and to check an account is gone. Tests confirm those routes answer 404 in development and production, and that the hosted-database refusal stops a whole run.
- No test sends a real email or needs the network.

## Deliberately not tested

| Not tested | Why |
|---|---|
| How pages look | There's no visual regression testing, because the animated background and glass effects would make screenshots unreliable. Only one layout rule, the confirm button label, has a test. |
| Other browsers and real phones | Chromium runs everything, and WebKit runs the phone checks, to keep the suite fast. Neither is a real phone, and the tests check where things are rather than how they look, so real iPhones are checked by hand. |
| Real email delivery | Sending through Brevo would need a live account and could spam real inboxes. Tests read an in-memory outbox instead. |
| Real mail-server (MX) lookups | The lookup is faked so tests never depend on the network. |
| Production hosting | Vercel rewrites, security headers set by Vercel, and the Render and Neon setup aren't covered. |
| Load and performance | Not needed at this scale. |
| The canvas background | It's decorative and has no game logic. |
| Real window lengths in a browser | End-to-end tests use the 30-second timers. Unit and API tests use the real values. The demo journeys move a demo's window on rather than wait for it. |
| A real sleeping server | Waking up is tested with a fake clock and stand-in requests. A real cold start on Render, including the Vercel proxy's own time limit, is checked by hand on the live site. |
| The sign-up switch in a browser | The browser tests run with sign-up open. Closed sign-up is covered by the API and component tests, and was checked by hand on the local stack. |

## Running the tests on Windows

You need Node.js 24 and npm. You don't need Postgres or Docker: the tests start their own throwaway database. Run these from PowerShell in the repo folder.

First time only:

```powershell
npm install
npm install --prefix server
npx playwright install chromium webkit
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

To try the app by hand on that same throwaway setup, run `node e2e/stack.mjs` and open http://localhost:5181. To see the live site's closed sign-up, start it with `$env:E2E_PUBLIC_SIGNUP_ENABLED = 'false'` first.

| If you see | Do this |
|---|---|
| An error about port 5434 | Something is using the API tests' database port. Stop it and run again. |
| An error about port 3011, 5181 or 5435 | The same, for the end-to-end stack. |
| `EPERM` on `rhabit-e2e-pg` after Ctrl+C | Harmless. The run was stopped during clean-up, and the next run clears the folder. |
| `Postgres pool error: read ECONNRESET` at the end | Harmless. The test API noticed the database shutting down. |

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs install, lint, tests with coverage, build, and the end-to-end tests, against a Postgres service that exists only for that run. Coverage reports, the Playwright HTML report and test results are uploaded as artifacts and kept for 14 days.

After a green run on `main`, a separate job updates the README's coverage badge by replacing the one file on the `badges` branch. That job is the only part of CI allowed to write to the repository.

Three optional Actions secrets replace the test-only values: `TEST_DB_PASSWORD`, `TEST_JWT_SECRET` and `TEST_TOTP_KEY`. CI passes without them, so forks work too. They should always be made-up test values, never production ones.
