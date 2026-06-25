// easy tasks give 1 hour, hard tasks give 2 hours
// confirm button unlocks 10 mins before end for easy, 1 hour before end for hard
const PENALTY_TASKS = [
  { title: 'Run 5km', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Do 100 push-ups', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Do 100 sit-ups', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Hold a plank for 5 minutes total', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Do 50 burpees', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Complete a 20 minute HIIT workout', difficulty: 'easy', timer_seconds: 3600 },
  { title: 'Run 10km', difficulty: 'hard', timer_seconds: 7200 },
  { title: 'Do 200 push-ups', difficulty: 'hard', timer_seconds: 7200 },
  { title: 'Complete a 60 minute workout session', difficulty: 'hard', timer_seconds: 7200 },
  { title: 'Do 300 squats', difficulty: 'hard', timer_seconds: 7200 },
  { title: 'Cycle 20km', difficulty: 'hard', timer_seconds: 7200 },
  { title: 'Complete a 45 minute run without stopping', difficulty: 'hard', timer_seconds: 7200 },
]

function getRandomPenaltyTask() {
  return PENALTY_TASKS[Math.floor(Math.random() * PENALTY_TASKS.length)]
}

module.exports = { PENALTY_TASKS, getRandomPenaltyTask }