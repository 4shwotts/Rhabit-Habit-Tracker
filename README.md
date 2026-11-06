# Rhabit

[![CI](https://github.com/4shwotts/Rhabit-Habit-Tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/4shwotts/Rhabit-Habit-Tracker/actions/workflows/ci.yml)
![Server coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/4shwotts/Rhabit-Habit-Tracker/badges/coverage.json)
![Tests: 327](https://img.shields.io/badge/tests-327-brightgreen)

A gamified daily habit tracker inspired by isekai game menus, including a penalty system modelled after Solo Levelling. Built as a portfolio project demonstrating full-stack development with React, Node.js, Express and PostgreSQL.

---

## Overview

Rhabit turns your daily habits into a progression system. Complete tasks within a daily time window to earn XP and level up. Miss your tasks and face a penalty challenge. The further you progress, the harder your tasks become and the shorter your window gets.

---

## Features

- **Goal Pathways** — Create multiple habit pathways (Fitness, Art, Study, etc.) each with independent XP and level progression
- **Daily Task Windows** — Tasks must be completed within a time window that shrinks as you level up
- **XP and Level System** — Earn XP per completed task and level up to unlock harder challenges
- **Penalty System** — Miss your window and face a random penalty challenge. Complete it to avoid losing XP
- **Smart Late Detection** — Opening the app too late automatically triggers the penalty system rather than letting you start a session you cannot finish
- **Task Refresh** — Swap out tasks you do not want to do (costs XP, or free with the setting toggled on)
- **Goal Memory** — Switch between goal pathways mid-day and your tasks are saved and restored when you switch back
- **Real-time Clock** — Live clock display in your local timezone
- **Works on phones** — Every page has its own small-screen layout, upright or sideways
- **Accounts** — Email verification, password reset and optional authenticator-app two-step sign-in

---

## Architecture

```
Browser (React)
    |  same-origin /api requests, session in an httpOnly cookie
    v
Vercel (static frontend, rewrites /api to the backend)
    |
    v
Render (Express API: validation, rate limits, game rules)
    |                    \
    v                     v
Neon (PostgreSQL)      Brevo (email)
```

- **The server decides everything that matters.** XP, levels and timers are worked out on the server from stored timestamps. The client only displays them, and strict request validation refuses any extra fields it sends.
- **Each day is settled in a locked transaction.** Every daily route first brings the day up to date with the clock, so a closed tab can't dodge a missed window or a penalty.
- **Resets follow the player's own time zone,** and run on that player's first request of the new day.
- **Every row belongs to a user.** Queries filter by owner, so another player's ids look like ids that don't exist.

### Tech Stack

**Frontend**
- React 19 + Vite
- React Router v7
- CSS animations (no animation libraries)
- Custom Rhabit display and text fonts

**Backend**
- Node.js + Express 5
- PostgreSQL (Neon) via `pg`, with SQL migrations
- JWT sessions in httpOnly cookies, bcrypt password hashing, TOTP two-step sign-in
- zod validation, helmet and express-rate-limit
- Timezone-aware daily resets via the Intl API

**Testing**
- Vitest, Testing Library, Supertest, Playwright and axe
- GitHub Actions

### Project Structure

```
Rhabit/
├── src/                  React frontend
│   ├── components/       pages, pop-ups and component tests
│   ├── auth/             session state and route guards
│   └── api.js            all calls to the API
├── server/
│   ├── routes/           API routes
│   ├── middleware/       auth, rate limits, daily reset
│   ├── lib/              game rules, sessions, email, 2FA
│   ├── db/               connection and SQL migrations
│   ├── tests/            unit and API tests
│   ├── app.js            builds the Express app
│   └── index.js          starts it
├── e2e/                  Playwright journeys and accessibility scan
├── .github/workflows/    CI
├── TESTING.md
└── BUGS.md
```

---

## Testing

The project has 327 automated tests: unit, component, API integration and end-to-end, plus an accessibility scan. They run on every push and pull request, and server code is at 90% line coverage.

```powershell
npm test              # component, unit and API tests
npm run test:coverage # the same, with coverage reports
npm run test:e2e      # end-to-end tests and accessibility scan
```

No Postgres install is needed; the tests start their own throwaway database and refuse to run against a hosted one.

- [TESTING.md](TESTING.md) covers the strategy, what's deliberately not tested, how to run everything on Windows, and full test counts and coverage.
- [BUGS.md](BUGS.md) writes up real bugs found along the way, with root causes, fixes and the tests that now guard them.

---

## Known Limitations

- **Rate limits are kept in memory.** They reset when the server restarts and wouldn't be shared across several server instances.
- **Logging out signs you out on every device.** There's no per-device session list, so one logout ends them all.
- **The first request can be slow,** because the hosted backend can go to sleep when idle.
- **Countdowns use the device's clock,** so a badly wrong clock shows the wrong time left. The server stays in charge of what's allowed, with a 5-second allowance.
- **Clock-change days are slightly off early in the day.** Time left until midnight assumes a 24-hour day, so it's an hour out before the clocks change. It's correct near midnight, when it matters.
- **Frontend pages rely on end-to-end tests,** so component coverage is low. Automated tests use Chromium, plus WebKit for phone layouts. Real iPhones are checked by hand.

---

## Getting Started

### Prerequisites
- Node.js 24
- npm
- A PostgreSQL database, such as a free Neon branch

### Installation

1. Clone the repository
```bash
git clone https://github.com/4shwotts/Rhabit-Habit-Tracker.git
cd Rhabit-Habit-Tracker
```

2. Install frontend and backend dependencies
```bash
npm install
npm install --prefix server
```

3. Copy `server/.env.example` to `server/.env`, fill in `DATABASE_URL`, then create the tables
```bash
npm run migrate --prefix server
```

### Running the App

**Windows** — double-click `start.bat` to launch everything automatically and open the browser.

**Manual launch:**

Terminal 1 — Backend:
```bash
cd server
npm run dev
```

Terminal 2 — Frontend:
```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173)

Without a Brevo key, emails such as verification links are printed in the backend terminal.

---

## First Time Setup

After signing up and verifying your email you will be taken to the setup page, where you name your first goal pathway and add tasks. Levels 1–3 need at least 3 tasks each before you can start; levels 4–10 are optional and can be added later from Goals.

---

## Game Design

### XP System
- 15 XP per completed task
- 3 tasks per day = 45 XP maximum per day
- 100 XP to level up
- Level 10 is the top level, and its bar stops at 100/100 XP
- A full bar at level 10 completes the pathway: its tasks and XP losses stop, and you can move on to another pathway
- Rerolling a task costs 10 XP, unless free rerolls are turned on
- Penalty deduction = 45 XP (capped so you cannot go below 0 on level 1)

### Task Level Unlock System
Tasks unlock progressively as you level up — every level up grants access to the next tier of harder tasks, with a mix of easier and harder tasks served to keep progression feeling earned rather than sudden.

### Daily Window by Level

The window is set by the hardest task rolled that day. The confirm button unlocks 30 minutes before it ends.

| Hardest Task Level | Window Duration |
|---|---|
| 1–3 | 3 hours |
| 4–6 | 2 hours |
| 7–9 | 1.5 hours |
| 10 | 1 hour |

### Penalty System
- Miss your window mid-session → penalty task assigned from a random pool
- Every penalty lasts 1 hour, and the confirm button unlocks 10 minutes before the end
- Fail the penalty → lose 45 XP
- Open the app too late to complete the window → penalty auto-triggers
- No time left for even a penalty → XP deducted immediately, with a message and the bar animating down
- Ticking tasks isn't enough → a window that ends without a confirm counts as missed
- Leave a day unfinished and close the site → the 45 XP still goes at the daily reset, and you're told on your next visit
- Don't open the app at all → every missed day costs 45 XP
- Pause Progression freezes progress and losses for a long break. It starts from the next day if you've already started your tasks

---

## License

MIT
