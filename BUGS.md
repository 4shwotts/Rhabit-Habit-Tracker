# Bugs found and fixed

Real bugs found while adding automated tests to Rhabit. Each entry shows how it was reproduced, why it happened, how it was fixed, and which test now guards it. For bugs 1 to 7, the main preventing test (listed first) was shown to fail on the old code. Bug 9 was proved on the old code with a throwaway test before the rule changed.

| # | Bug | Found by | Status |
|---|---|---|---|
| 1 | [Timer stuck at 00:00:00 with no penalty](#1-timer-stuck-at-000000-with-no-penalty) | Manual play-through | Fixed |
| 2 | [Penalty requests sent twice](#2-penalty-requests-sent-twice) | Lint, component tests | Fixed |
| 3 | [Failed penalty request opened an empty pop-up](#3-failed-penalty-request-opened-an-empty-pop-up) | Investigating bug 1 | Fixed |
| 4 | [A huge XP amount hung the server](#4-a-huge-xp-amount-hung-the-server) | Unit tests | Fixed |
| 5 | [Goals at level 13 and above got no tasks](#5-goals-at-level-13-and-above-got-no-tasks) | Unit tests | Fixed |
| 6 | [Logout left the session working](#6-logout-left-the-session-working) | API test review | Fixed |
| 7 | [Confirm label overflowed its button](#7-confirm-label-overflowed-its-button) | Manual play-through | Fixed |
| 8 | [Logo file is 1.44 MB](#8-logo-file-is-144-mb) | Build output | Fixed |
| 9 | [The midnight reset erased punishments](#9-the-midnight-reset-erased-punishments) | Code review | Fixed |

---

## 1. Timer stuck at 00:00:00 with no penalty

**Summary:** the window timer could reach 00:00:00 and stay there, with no penalty and no pop-up.

**Steps to reproduce:**
1. Start a day and leave the tasks unticked.
2. Load or reload Home in the 5 seconds after the window ends, before the server counts it as missed.

**Expected:** the penalty starts and the pop-up appears.

**Actual:** the timer sat at 00:00:00 until the page was reloaded again.

**Root cause:** the timer only counted down from a number. If the page loaded with no time left, the timer never started, so nothing noticed the window had ended. The server only settles a missed window after a 5-second grace period, which left that gap.

**Fix:** the timer now checks the stored end time every second and asks for the penalty once time is up, however the page got there.

**Preventing test:** `still starts the penalty when the page loads just after the window ended` in `src/components/HomePage.test.jsx`, plus the missed-window journey in `e2e/journeys.spec.js`.

**Note:** this was found while investigating a failed play-through. That exact run couldn't be reproduced, so this is the one cause found that gives the same symptom, not a confirmed match. It has not been reported since.

## 2. Penalty requests sent twice

**Summary:** the penalty trigger and fail requests were each sent more than once.

**Steps to reproduce:**
1. Start a day and leave the tasks unticked.
2. Let the window run out, with the Network tab open.

**Expected:** one `POST /api/daily/penalty/trigger`, and later one `/fail`.

**Actual:** two of each.

**Root cause:** the requests were made inside React state updater functions, which must have no side effects because React may run them more than once. A lint error about the same code led to this.

**Fix:** updaters now only change state. The window timer's interval and the penalty pop-up's effect make the request, guarded so it can't repeat. No XP was ever lost twice, because the server routes are safe to repeat.

**Preventing test:** `asks for the penalty exactly once` and `fails the penalty once when its own timer runs out` in `src/components/HomePage.test.jsx`. The missed-window journey counts the real requests.

## 3. Failed penalty request opened an empty pop-up

**Summary:** if the penalty request failed, a broken pop-up opened with no penalty behind it.

**Steps to reproduce:**
1. Start a day and leave the tasks unticked.
2. Make `POST /api/daily/penalty/trigger` fail, for example with a 500.
3. Let the window run out.

**Expected:** the pop-up stays closed and the request is tried again.

**Actual:** an empty pop-up opened, then tried to fail a penalty that didn't exist (a 400 from the server).

**Root cause:** the API client returns errors as `{ error }` rather than throwing, and the handler never checked for one.

**Fix:** the pop-up only opens once the server confirms a penalty is active. Otherwise the timer asks again after 5 seconds.

**Preventing test:** `keeps the pop-up closed if the request fails, and tries again` and `never reports a penalty that is not running` in `src/components/HomePage.test.jsx`.

## 4. A huge XP amount hung the server

**Summary:** adding XP looped once per level gained, so a large amount blocked the server, and invalid amounts produced bad XP.

**Steps to reproduce:** call `addXp(0, 1, amount)` with a large or invalid amount.

**Expected:** an immediate, sensible result or a clear error.

**Actual:**

| Call | Result |
|---|---|
| `addXp(0, 1, 1e11)` | 862ms, level 1,000,000,001 |
| `addXp(0, 1, Infinity)` | never returned |
| `addXp(0, 1, NaN)` | NaN XP |
| `addXp(10, 2, -30)` | -20 XP |
| `deductXp(50, 1, -100)` | 150 XP at level 1 |

**Root cause:** levels were worked out with a `while` loop, and amounts were never checked. No current route sends such values, since amounts come from server constants, so this was a latent risk rather than a live exploit.

**Fix:** levels are calculated with division, one action can change XP by at most one level, and anything other than a whole number of 0 or more throws, rolling the request back.

**Preventing test:** `caps a huge amount at one level per action and returns at once`, `rejects an amount that is %s` and `undoes addXp exactly` in `server/tests/unit/game.test.mjs`.

## 5. Goals at level 13 and above got no tasks

**Summary:** a goal reaching level 13 stopped receiving daily tasks and rerolls.

**Steps to reproduce:**
1. Take a goal to level 13.
2. Wait for the next daily reset.

**Expected:** three tasks, as on any other day.

**Actual:** no tasks. At level 11, tier 9 tasks also came back after being phased out.

**Root cause:** task tiers stop at 10, but the lowest unlocked tier kept rising with the level. Level 13 asked for tiers 11 to 10, which is an empty range. The rule only handled `level === 10` exactly.

**Fix:** from level 10 onwards, only tier 10 is used.

**Preventing test:** `never asks for an empty range of tiers`, `level %i offers tiers %i to %i` and `still gives a level 13 goal its tasks` in `server/tests/unit/game.test.mjs`.

## 6. Logout left the session working

**Summary:** logging out only removed the browser's cookie, so a copy of that cookie kept working.

**Steps to reproduce:**
1. Log in and copy the session cookie.
2. Log out.
3. Call `GET /api/auth/me` with the copied cookie.

**Expected:** 401.

**Actual:** 200, for up to 12 hours.

**Root cause:** sessions are signed tokens checked on each request, and logout changed nothing on the server.

**Fix:** logout increases the account's `token_version`, which ends every session on every device. The app's clean-up when a new visit starts only clears that browser's cookie, so opening a new tab doesn't sign out other devices.

**Preventing test:** `ends the session on the server too, on every device` and `only drops this browser's cookie when a new visit cleans up` in `server/tests/api/auth.test.mjs`.

## 7. Confirm label overflowed its button

**Summary:** the text "Tick all tasks to confirm" ran out of the sides of its button.

**Steps to reproduce:**
1. Start a day and tick nothing.
2. Wait for confirm to unlock.

**Expected:** the label sits inside the button.

**Actual:** the label overflowed on both sides.

**Root cause:** the button had a fixed width of 272px and 32px of padding, leaving 208px for a label about 290px wide that can't wrap.

**Fix:** the button now fits its label, with 272px as a minimum.

**Preventing test:** `the longest confirm label fits inside its button` in `e2e/journeys.spec.js`.

## 8. Logo file is 1.44 MB

**Summary:** the logo is by far the largest file in the build.

**Steps to reproduce:** run `npm run build` and read the size list.

**Expected:** a logo in the tens of kilobytes.

**Actual:** `Rhabit Logo.svg` is 1,440 kB, or 1,074 kB gzipped, about ten times the size of all the app's JavaScript when gzipped.

**Root cause:** the SVG was a wrapper around one embedded 1024×1536 PNG, so it held pixels rather than vector shapes.

**Fix:** the flat logo was traced into a single vector path, keeping the same shape, size and shadow. It's now 1.95 kB and stays sharp at any size.

**Preventing test:** `src/assets/assets.test.js` fails if any image or icon reaches 200 kB. It was shown to fail on the old logo.

## 9. The midnight reset erased punishments

**Summary:** closing the site, or running past midnight, could dodge an XP loss.

**Steps to reproduce:**
1. Start a day at 20:30 and leave the tasks unticked.
2. Miss the window at 23:30, so the 1-hour penalty runs past midnight. Alternatively, start a day and close the site until tomorrow.
3. Open the app after midnight.

**Expected:** the 45 XP is lost, and the player is told.

**Actual:** the day was wiped with no XP lost and no message.

**Root cause:** the daily reset cleared the old day without settling it. With the original short timers this was rarely reachable, but 3-hour windows and 1-hour penalties made it easy.

**Fix:**
- The reset now settles missed days first. The last day costs 45 XP unless it was confirmed, and each day the app wasn't opened costs 45 XP too.
- A penalty that can't finish before midnight is never started. The XP goes at once, with a message and the bar animating down.
- A loss the player didn't see is stored and shown on their next visit, until it has been seen.
- Pause Progression freezes losses, so paused days aren't charged. A day already started before pausing still is.

**Preventing test:** the `leaving a day unfinished` and `too late in the day` groups in `server/tests/api/game.test.mjs`, `XP lost while away` in `src/components/HomePage.test.jsx`, and `leaving a started day unfinished still costs XP on the next visit` in `e2e/journeys.spec.js`.
