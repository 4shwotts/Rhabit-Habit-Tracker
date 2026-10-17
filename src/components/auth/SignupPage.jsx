import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { signup, resendVerification } from '../../api'

const MIN_PASSWORD = 8

function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // once submitted we only ever show the generic "check your inbox" message
  const [sentMessage, setSentMessage] = useState(null)
  const [resendMessage, setResendMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!username.trim()) return setError('Enter a username')
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    if (password !== confirm) return setError('Passwords do not match')

    setSubmitting(true)
    const result = await signup({
      username: username.trim(),
      email: email.trim(),
      password,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    setSubmitting(false)

    if (result.error) return setError(result.error)
    setSentMessage(result.message)
  }

  async function handleResend() {
    const result = await resendVerification(email.trim())
    setResendMessage(result.error || result.message)
  }

  if (sentMessage) {
    return (
      <AuthLayout title="CHECK YOUR INBOX" subtitle={sentMessage}>
        <p className="setup-greeting auth-subtitle">
          Click the link in the email to verify your account, then log in.
        </p>
        <AuthMessage message={resendMessage} />
        <div className="auth-links">
          <button className="auth-link auth-link-btn" type="button" onClick={handleResend}>
            Didn't get it? Resend the link
          </button>
          <Link className="auth-link" to="/login">Back to log in</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="NEW PLAYER" subtitle="REGISTER WITH THE SYSTEM TO BEGIN YOUR PROGRESSION">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          label="USERNAME" id="signup-username" type="text" autoComplete="nickname"
          value={username} onChange={e => setUsername(e.target.value)} maxLength={20} required
        />
        <AuthField
          label="EMAIL" id="signup-email" type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required
        />
        <AuthField
          label="PASSWORD" id="signup-password" type="password" autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} maxLength={72} required
        />
        <AuthField
          label="CONFIRM PASSWORD" id="signup-confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} maxLength={72} required
        />
        <p className="auth-hint">At least {MIN_PASSWORD} characters.</p>

        <AuthMessage error={error} />

        <button className="auth-btn" type="submit" disabled={submitting || !username || !email || !password || !confirm}>
          {submitting ? 'Registering...' : 'Sign up'}
        </button>
      </form>

      <div className="auth-links">
        <Link className="auth-link" to="/login">Already registered? Log in</Link>
      </div>
    </AuthLayout>
  )
}

export default SignupPage
