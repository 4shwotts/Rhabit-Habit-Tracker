const config = require('../config')
const { TEST_TIMER_SECONDS } = require('../lib/game')

// demo mode — shortened timers so visitors can test the penalty system quickly
// confirm unlocks 1 minute before end for all tasks
const PENALTY_TASKS = [
  { title: 'Run 5km', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Do 100 push-ups', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Do 100 sit-ups', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Hold a plank for 5 minutes total', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Do 50 burpees', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Complete a 20 minute HIIT workout', difficulty: 'easy', timer_seconds: 180 },
  { title: 'Run 10km', difficulty: 'hard', timer_seconds: 300 },
  { title: 'Do 200 push-ups', difficulty: 'hard', timer_seconds: 300 },
  { title: 'Complete a 60 minute workout session', difficulty: 'hard', timer_seconds: 300 },
  { title: 'Do 300 squats', difficulty: 'hard', timer_seconds: 300 },
  { title: 'Cycle 20km', difficulty: 'hard', timer_seconds: 300 },
  { title: 'Complete a 45 minute run without stopping', difficulty: 'hard', timer_seconds: 300 },
]

function getRandomPenaltyTask() {
  const task = PENALTY_TASKS[Math.floor(Math.random() * PENALTY_TASKS.length)]
  // TEST_TIMERS (local only): every penalty lasts 30 seconds
  if (config.testTimers) return { ...task, timer_seconds: TEST_TIMER_SECONDS }
  return task
}

module.exports = { PENALTY_TASKS, getRandomPenaltyTask }