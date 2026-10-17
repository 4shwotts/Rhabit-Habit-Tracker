import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthMessage } from './AuthLayout'
import { verifyEmail } from '../../api'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

// Landing page for the link in the verification email (/verify-email?token=...).
function VerifyEmailPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'))
  const [status, setStatus] = useState(token ? 'working' : 'failed') // working | done | failed
  const [error, setError] = useState(token ? null : 'This verification link is invalid or has expired.')
  // tokens are single-use, so make sure StrictMode's double effect run
  // doesn't submit it twice and report the second attempt as a failure
  const submitted = useRef(false)

  useEffect(() => {
    // take the token out of the address bar and browser history
    window.history.replaceState(null, '', '/verify-email')

    if (!token || submitted.current) return
    submitted.current = true

    verifyEmail(token).then(async result => {
      if (result.error) {
        setStatus('failed')
        setError(result.error)
        return
      }
      await refresh()
      setStatus('done')
    })
  }, [token, refresh])

  if (status === 'working') {
    return <AuthLayout title="VERIFYING..." subtitle="CONFIRMING YOUR IDENTITY WITH THE SYSTEM" />
  }

  if (status === 'failed') {
    return (
      <AuthLayout title="VERIFICATION FAILED">
        <AuthMessage error={error} />
        <p className="setup-greeting auth-subtitle">Log in to request a new link.</p>
        <div className="auth-links">
          <Link className="auth-link" to="/">Continue</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="EMAIL VERIFIED" subtitle="YOUR ACCOUNT IS NOW ACTIVE">
      <button
        className="auth-btn"
        type="button"
        onClick={() => navigate(user ? pathForStage(stageOf(user)) : '/login', { replace: true })}
      >
        {user ? 'Continue' : 'Log in'}
      </button>
    </AuthLayout>
  )
}

export default VerifyEmailPage
