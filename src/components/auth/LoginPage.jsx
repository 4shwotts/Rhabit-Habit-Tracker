import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { login } from '../../api'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

function LoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    const result = await login(email.trim(), password)
    if (result.error) {
      // the server's message is deliberately generic ("Invalid email or password")
      setError(result.error)
      setSubmitting(false)
      return
    }

    const user = await refresh()
    navigate(pathForStage(stageOf(user)), { replace: true })
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
