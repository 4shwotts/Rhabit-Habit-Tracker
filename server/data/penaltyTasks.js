const { PENALTY_SECONDS } = require('../lib/game')

// every penalty lasts the same time; confirm unlocks 10 minutes before the end
const PENALTY_TASKS = [
  { title: 'Run 5km', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Do 100 push-ups', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Do 100 sit-ups', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Hold a plank for 5 minutes total', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Do 50 burpees', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Complete a 20 minute HIIT workout', difficulty: 'easy', timer_seconds: PENALTY_SECONDS },
  { title: 'Run 10km', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
  { title: 'Do 200 push-ups', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
  { title: 'Complete a 60 minute workout session', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
  { title: 'Do 300 squats', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
  { title: 'Cycle 20km', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
  { title: 'Complete a 45 minute run without stopping', difficulty: 'hard', timer_seconds: PENALTY_SECONDS },
]

function getRandomPenaltyTask() {
  return PENALTY_TASKS[Math.floor(Math.random() * PENALTY_TASKS.length)]
}

module.exports = { PENALTY_TASKS, getRandomPenaltyTask }