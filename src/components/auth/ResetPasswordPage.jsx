import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { resetPassword } from '../../api'
import { useAuth } from '../../auth/AuthContext'

const MIN_PASSWORD = 8

// Landing page for the link in the reset email (/reset-password?token=...).
function ResetPasswordPage() {
  const { setUser } = useAuth()
  // read the token once (kept in state so it survives the URL clean-up below)
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'))
  // then take it out of the address bar and browser history
  useEffect(() => {
    window.history.replaceState(null, '', '/reset-password')
  }, [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(token ? null : 'This reset link is invalid or has expired.')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    if (password !== confirm) return setError('Passwords do not match')

    setSubmitting(true)
    const result = await resetPassword(token, password)
    setSubmitting(false)
    if (result.error) return setError(result.error)

    // the server revokes every existing session on reset, including this one
    setUser(null)
    setDone(true)
  }

  if (done) {
    return (
      <AuthLayout title="PASSWORD UPDATED" subtitle="ALL OTHER SESSIONS HAVE BEEN LOGGED OUT">
        <div className="auth-links">
          <Link className="auth-link" to="/login">Log in with your new password</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="NEW PASSWORD" subtitle="CHOOSE A NEW PASSWORD FOR YOUR ACCOUNT">
      {token ? (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <AuthField
            label="NEW PASSWORD" id="reset-password" type="password" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} maxLength={72} required
          />
          <AuthField
            label="CONFIRM PASSWORD" id="reset-confirm" type="password" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} maxLength={72} required
          />
          <p className="auth-hint">At least {MIN_PASSWORD} characters.</p>
          <AuthMessage error={error} />
          <button className="auth-btn" type="submit" disabled={submitting || !password || !confirm}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </form>
      ) : (
        <AuthMessage error={error} />
      )}

      <div className="auth-links">
        <Link className="auth-link" to="/forgot-password">Request a new link</Link>
        <Link className="auth-link" to="/login">Back to log in</Link>
      </div>
    </AuthLayout>
  )
}

export default ResetPasswordPage
