import { useEffect, useState } from 'react'

// How long a request may take before the visitor is told the server is waking
export const SLOW_REQUEST_MS = 2000

// True once `attempt` has been waiting for SLOW_REQUEST_MS. `attempt` is null
// while nothing is waiting, and a new value (e.g. a counter) for each request,
// so a new request starts the wait again.
// eslint-disable-next-line react-refresh/only-export-components
export function useSlowRequest(attempt, delay = SLOW_REQUEST_MS) {
  const [slowAttempt, setSlowAttempt] = useState(null)
  useEffect(() => {
    if (attempt === null) return
    const timer = setTimeout(() => setSlowAttempt(attempt), delay)
    return () => clearTimeout(timer)
  }, [attempt, delay])
  return attempt !== null && slowAttempt === attempt
}

// Shown while a request is taking a while: Render's free tier sleeps when idle,
// so the first request can take up to a minute.
export function WakingNotice() {
  return (
    <div className="server-wait" role="status">
      <span className="server-wait-bars" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>Waking the server — this can take up to a minute</span>
    </div>
  )
}

// Shown when the server still couldn't be reached, with a way to try again.
export function UnreachableNotice({ onRetry }) {
  return (
    <div className="server-error" role="alert">
      <p>Couldn&apos;t reach the server, please try again.</p>
      <button className="auth-btn server-retry-btn" type="button" onClick={onRetry}>Retry</button>
    </div>
  )
}
