import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthMessage } from './AuthLayout'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'
import { useSlowRequest, WakingNotice, UnreachableNotice } from '../ServerStatus'

// /demo: the link for a portfolio's "Live demo" button. It starts a demo
// straight away and lands on Home, so a visitor never sees the login page.
// If the server is slow to wake it says so, and if it can't be reached it
// offers a retry.
function DemoStartPage() {
  const { user, startDemo } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [unreachable, setUnreachable] = useState(false)
  // React runs effects twice in development; this makes sure only one demo starts
  const started = useRef(false)
  // the request still waiting (a new number each time, null when none). The
  // page starts one straight away, unless someone is already signed in.
  const attempts = useRef(1)
  const [attempt, setAttempt] = useState(user ? null : 1)
  const slow = useSlowRequest(attempt)

  // goes to Home, or shows why the demo couldn't start
  const finish = useCallback(result => {
    setAttempt(null)
    if (result.unreachable) {
      setUnreachable(true)
      return
    }
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(pathForStage(stageOf(result.user)), { replace: true })
  }, [navigate])

  useEffect(() => {
    if (started.current) return
    started.current = true
    // already signed in (a refresh, or a real player): carry on where they are
    if (user) {
      navigate(pathForStage(stageOf(user)), { replace: true })
      return
    }
    startDemo().then(finish)
  }, [user, navigate, startDemo, finish])

  async function retry() {
    setError(null)
    setUnreachable(false)
    setAttempt(++attempts.current)
    finish(await startDemo())
  }

  if (unreachable) {
    return (
      <AuthLayout title="DEMO" subtitle="THE DEMO COULD NOT START">
        <UnreachableNotice onRetry={retry} />
        <div className="auth-links">
          <Link className="auth-link" to="/login">Go to log in</Link>
        </div>
      </AuthLayout>
    )
  }

  if (error) {
    return (
      <AuthLayout title="DEMO" subtitle="THE DEMO COULD NOT START">
        <AuthMessage error={error} />
        <button className="auth-btn" type="button" onClick={retry}>Try again</button>
        <div className="auth-links">
          <Link className="auth-link" to="/login">Go to log in</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="DEMO" subtitle="STARTING THE DEMO...">
      <p className="auth-demo-note">Setting up a temporary account for you.</p>
      {slow && <WakingNotice />}
    </AuthLayout>
  )
}

export default DemoStartPage
