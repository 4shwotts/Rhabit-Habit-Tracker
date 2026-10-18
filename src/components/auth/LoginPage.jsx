import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { login, verifyTwoFactor } from '../../api'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

function LoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // second step, shown when the account has two-step sign-in turned on
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)

  async function finishLogin() {
    const user = await refresh()
    navigate(pathForStage(stageOf(user)), { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    const result = await login(email.trim(), password)
    setSubmitting(false)

    // right password but email not verified yet: show the verify page (no session)
    if (result.code === 'EMAIL_NOT_VERIFIED') {
      navigate('/verify-pending', { state: { email: email.trim() } })
      return
    }
    if (result.error) {
      // the server's message is deliberately generic ("Invalid email or password")
      setError(result.error)
      return
    }
    if (result.two_factor_required) {
      setNeedsCode(true)
      return
    }
    await finishLogin()
  }

  async function handleCode(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    const result = await verifyTwoFactor(code.trim())
    setSubmitting(false)

    if (result.code === 'CHALLENGE_EXPIRED') {
      // took longer than 5 minutes, or the password changed meanwhile
      setNeedsCode(false)
      setCode('')
      setPassword('')
      setError(result.error)
      return
    }
    if (result.error) {
      setError(result.error)
      return
    }
    await finishLogin()
  }

  if (needsCode) {
    return (
      <AuthLayout
        title="TWO-STEP SIGN-IN"
        subtitle={useBackupCode
          ? 'ENTER ONE OF YOUR BACKUP CODES'
          : 'ENTER THE 6-DIGIT CODE FROM YOUR AUTHENTICATOR APP'}
      >
        <form className="auth-form" onSubmit={handleCode} noValidate>
          <AuthField
            label={useBackupCode ? 'BACKUP CODE' : 'CODE'}
            id="login-code"
            type="text"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={useBackupCode ? 12 : 6}
            autoFocus
            required
          />
          <AuthMessage error={error} />
          <button className="auth-btn" type="submit" disabled={submitting || !code.trim()}>
            {submitting ? 'Checking...' : 'Verify'}
          </button>
        </form>

        <div className="auth-links">
          <button
            className="auth-link auth-link-btn"
            type="button"
            onClick={() => { setUseBackupCode(b => !b); setCode(''); setError(null) }}
          >
            {useBackupCode ? 'Use your authenticator app instead' : 'Lost your phone? Use a backup code'}
          </button>
          <button
            className="auth-link auth-link-btn"
            type="button"
            onClick={() => { setNeedsCode(false); setCode(''); setError(null) }}
          >
            Back to log in
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="SYSTEM ACCESS" subtitle="IDENTIFY YOURSELF TO RESUME YOUR PROGRESSION">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          label="EMAIL" id="login-email" type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required
        />
        <AuthField
          label="PASSWORD" id="login-password" type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} maxLength={128} required
        />

        <AuthMessage error={error} />

        <button className="auth-btn" type="submit" disabled={submitting || !email || !password}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <div className="auth-links">
        <Link className="auth-link" to="/forgot-password">Forgotten your password?</Link>
        <Link className="auth-link" to="/signup">New here? Create an account</Link>
      </div>
    </AuthLayout>
  )
}

export default LoginPage
