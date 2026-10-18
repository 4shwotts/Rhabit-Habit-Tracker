// All API calls go to /api on the frontend's own origin — Vite proxies it in
// development and a Vercel rewrite proxies it in production — so the httpOnly
// session cookie is first-party and sent automatically.
const BASE = import.meta.env.VITE_API_URL || '/api'

// Shared fetch wrapper. Always resolves to the parsed JSON body; failed
// requests get an `error` string so callers can keep checking `result.error`.
async function request(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'include' }
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, options)
  } catch {
    return { error: 'Cannot reach the Rhabit server. Check your connection and try again.' }
  }

  let data
  try {
    data = await res.json()
  } catch {
    // a non-JSON 5xx comes from the proxy, not our API — the backend is down or asleep
    if (res.status >= 500) {
      return { error: 'Cannot reach the Rhabit server. Is the backend running?' }
    }
    data = {}
  }

  // a 401 from a game route means the session expired or was revoked —
  // AuthContext listens for this and sends the user back to the login page
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('rhabit:session-expired'))
  }

  if (!res.ok && !data.error) data.error = 'Something went wrong. Please try again.'
  return data
}

// auth
export async function getMe() {
  const data = await request('/auth/me')
  return data.user || null
}

// signed timestamp the signup form sends back (server-side timing check)
export async function getSignupToken() {
  const data = await request('/auth/signup-token')
  return data.token || null
}

export function signup(fields) {
  return request('/auth/signup', { method: 'POST', body: fields })
}

export function login(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } })
}

export function logout() {
  return request('/auth/logout', { method: 'POST' })
}

export function verifyEmail(token) {
  return request('/auth/verify-email', { method: 'POST', body: { token } })
}

export function resendVerification(email) {
  return request('/auth/resend-verification', { method: 'POST', body: { email } })
}

export function forgotPassword(email) {
  return request('/auth/forgot-password', { method: 'POST', body: { email } })
}

export function resetPassword(token, password) {
  return request('/auth/reset-password', { method: 'POST', body: { token, password } })
}

export function deleteAccount(password) {
  return request('/auth/account', { method: 'DELETE', body: { password } })
}

// user
export async function getUser() {
  const data = await request('/user')
  return data.error ? null : data
}

export function updateSettings(settings) {
  return request('/user/settings', { method: 'PATCH', body: settings })
}

export function updateUsername(username) {
  return request('/user/username', { method: 'PATCH', body: { username } })
}

// first-time setup in one request: goal pathway + tasks per level
export function completeSetup(goalName, levels) {
  return request('/setup', { method: 'POST', body: { goal_name: goalName, levels } })
}

// goals
export async function getGoals() {
  const data = await request('/goals')
  return Array.isArray(data) ? data : []
}

export function createGoal(name) {
  return request('/goals', { method: 'POST', body: { name } })
}

export function updateGoalName(id, name) {
  return request(`/goals/${id}/name`, { method: 'PATCH', body: { name } })
}

export function starGoal(id) {
  return request(`/goals/${id}/star`, { method: 'PATCH' })
}

export function unstarGoal(id) {
  return request(`/goals/${id}/unstar`, { method: 'PATCH' })
}

export function deleteGoal(id) {
  return request(`/goals/${id}`, { method: 'DELETE' })
}

export function saveGoalTasks(goalId, level, tasks) {
  return request(`/goals/${goalId}/tasks`, { method: 'POST', body: { level, tasks } })
}

// daily
export function getDaily() {
  return request('/daily')
}

export function startDaily() {
  return request('/daily/start', { method: 'POST' })
}

export function checkTask(id, checked) {
  return request(`/daily/tasks/${id}/check`, { method: 'PATCH', body: { checked } })
}

export function confirmDaily() {
  return request('/daily/confirm', { method: 'POST' })
}

export function refreshTask(id) {
  return request(`/daily/tasks/${id}/refresh`, { method: 'POST' })
}

// penalty
export function triggerPenalty() {
  return request('/daily/penalty/trigger', { method: 'POST' })
}

export function confirmPenalty() {
  return request('/daily/penalty/confirm', { method: 'POST' })
}

export function failPenalty() {
  return request('/daily/penalty/fail', { method: 'POST' })
}
