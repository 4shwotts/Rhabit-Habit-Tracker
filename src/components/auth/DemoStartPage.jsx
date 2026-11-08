import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthMessage } from './AuthLayout'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

// /demo: the link for a portfolio's "Live demo" button. It starts a demo
// straight away and lands on Home, so a visitor never sees the login page.
// The backend can take up to a minute to wake up, so it says so while it waits.
function DemoStartPage() {
  const { user, startDemo } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  // React runs effects twice in development; this makes sure only one demo starts
  const started = useRef(false)

  // goes to Home, or shows why the demo couldn't start
  const finish = useCallback(result => {
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
    finish(await startDemo())
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
      <p className="auth-demo-note" role="status">
        Setting up a temporary account for you. This can take up to a minute while the server wakes up.
      </p>
    </AuthLayout>
  )
}

export default DemoStartPage
