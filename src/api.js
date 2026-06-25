const BASE = 'http://localhost:3001/api'

// user
export async function getUser() {
  const res = await fetch(`${BASE}/user`)
  if (!res.ok) return null
  return res.json()
}

export async function createUser(username, timezone) {
  const res = await fetch(`${BASE}/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, timezone })
  })
  return res.json()
}

export async function updateSettings(settings) {
  const res = await fetch(`${BASE}/user/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
  return res.json()
}

// goals
export async function getGoals() {
  const res = await fetch(`${BASE}/goals`)
  return res.json()
}

export async function createGoal(name) {
  const res = await fetch(`${BASE}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function updateGoalName(id, name) {
  const res = await fetch(`${BASE}/goals/${id}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function updateGoalXP(id, xp, level) {
  const res = await fetch(`${BASE}/goals/${id}/xp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xp, level })
  })
  return res.json()
}

export async function starGoal(id) {
  const res = await fetch(`${BASE}/goals/${id}/star`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function unstarGoal(id) {
  const res = await fetch(`${BASE}/goals/${id}/unstar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function deleteGoal(id) {
  const res = await fetch(`${BASE}/goals/${id}`, { method: 'DELETE' })
  return res.json()
}

export async function saveGoalTasks(goalId, level, tasks) {
  const res = await fetch(`${BASE}/goals/${goalId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, tasks })
  })
  return res.json()
}

// daily
export async function getDaily() {
  const res = await fetch(`${BASE}/daily`)
  return res.json()
}

export async function startDaily() {
  const res = await fetch(`${BASE}/daily/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function checkTask(id, checked) {
  const res = await fetch(`${BASE}/daily/tasks/${id}/check`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checked })
  })
  return res.json()
}

export async function confirmDaily() {
  const res = await fetch(`${BASE}/daily/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function refreshTask(id) {
  const res = await fetch(`${BASE}/daily/tasks/${id}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

// penalty
export async function triggerPenalty() {
  const res = await fetch(`${BASE}/daily/penalty/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function confirmPenalty() {
  const res = await fetch(`${BASE}/daily/penalty/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export async function failPenalty() {
  const res = await fetch(`${BASE}/daily/penalty/fail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

// skips the modal entirely — not enough time in the day for a penalty task
export async function autoFailPenalty() {
  const res = await fetch(`${BASE}/daily/penalty/auto-fail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}