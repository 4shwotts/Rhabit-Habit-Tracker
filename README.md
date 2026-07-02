# Rhabit — Demo Version

A gamified daily habit tracker inspired by isekai game menus, including a penalty system modelled after Solo Levelling. Built as a portfolio project demonstrating full-stack development with React, Node.js, Express, and SQLite.

> **Note:** This repository contains the **demo version** of Rhabit. Time windows, XP thresholds, and penalty timers are compressed for quick demonstration purposes. See the [Demo vs Full Version](#demo-vs-full-version) section for the full intended values.

---

## Overview

Rhabit turns your daily habits into a progression system. Complete tasks within a daily time window to earn XP and level up. Miss your tasks and face a penalty challenge. The further you progress, the harder your tasks become and the shorter your window gets.

---

## Demo vs Full Version

| Feature | Demo Version | Full Version |
|---|---|---|
| Daily task window | ~5 minutes | 1–3 hours (scales with level) |
| Penalty timer (easy) | ~2 minutes | 1 hour |
| Penalty timer (hard) | ~4 minutes | 2 hours |
| XP per task | 5 XP | 5 XP |
| XP to level up | 30 XP | 100 XP |
| Penalty deduction | 15 XP | 15 XP |

The demo is designed so you can experience the full loop — setup, tasks, penalty, level up — within a few minutes without committing to a real daily routine.

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

---

## Tech Stack

**Frontend**
- React 18 + Vite
- React Router v6
- CSS animations (no animation libraries)
- Alumni Sans font

**Backend**
- Node.js + Express
- SQLite via better-sqlite3
- Timezone-aware daily resets via Intl API

---

## Project Structure

```
Rhabit/
├── src/
│   ├── components/
│   │   ├── HomePage.jsx
│   │   ├── GoalsPage.jsx
│   │   ├── SetupPage.jsx
│   │   ├── PenaltyModal.jsx
│   │   └── SettingsModal.jsx
│   ├── api.js
│   ├── App.jsx
│   └── App.css
├── server/
│   ├── db/
│   │   ├── database.js
│   │   └── schema.js
│   ├── routes/
│   │   ├── user.js
│   │   ├── goals.js
│   │   └── daily.js
│   ├── middleware/
│   │   └── checkDailyReset.js
│   ├── data/
│   │   └── penaltyTasks.js
│   └── index.js
├── start.bat
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

1. Clone the repository
```bash
git clone https://github.com/4shwotts/Rhabit-Habit-Tracker-.git
cd Rhabit-Habit-Tracker-
```

2. Install frontend dependencies
```bash
npm install
```

3. Install backend dependencies
```bash
cd server
npm install
cd ..
```

### Running the App

**Windows** — double-click `start.bat` to launch everything automatically and open the browser.

**Manual launch:**

Terminal 1 — Backend:
```bash
cd server
node index.js
```

Terminal 2 — Frontend:
```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173)

---

## First Time Setup

On first launch you will be taken to the setup page where you enter your username, name your first goal pathway, and add tasks for each of the 10 levels. A minimum of 3 tasks per level is required before you can start.

---

## Game Design (Full Version Values)

### XP System
- 15 XP per completed task
- 3 tasks per day = 45 XP maximum per day
- 100 XP to level up
- Penalty deduction = 45 XP (capped so you cannot go below 0 on level 1)

### Task Level Unlock System
Tasks unlock progressively as you level up — every level up grants access to the next tier of harder tasks, with a mix of easier and harder tasks served to keep progression feeling earned rather than sudden.

### Daily Window by Level (Full Version)

| Goal Level | Window Duration |
|---|---|
| 1–3 | 3 hours |
| 4–6 | 2 hours |
| 7–9 | 1.5 hours |
| 10+ | 1 hour |

### Penalty System
- Miss your window mid-session → penalty task assigned from a random pool
- **Easy penalty:** 1 hour to complete, confirm button unlocks at 50 minutes
- **Hard penalty:** 2 hours to complete, confirm button unlocks at 1 hour in
- Fail the penalty → lose 45 XP
- Open the app too late to complete the window → penalty auto-triggers
- Open the app with no time left for even a penalty → XP deducted immediately

---

## Notes

- Single-user application designed for personal use
- Data stored locally in SQLite and is not included in the repository
- Portfolio project demonstrating React, Node.js/Express, SQLite, and full-stack integration

---

## License

MIT
