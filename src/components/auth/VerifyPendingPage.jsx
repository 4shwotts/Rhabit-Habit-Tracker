import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { resendVerification } from '../../api'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

// "Verify your email" screen. Unverified accounts never get a session, so this
// is informational only: it shows where the link went and can resend it. After
// clicking the link, the user logs in normally.
function VerifyPendingPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // from the login page; an older session (from before this change) also works
  const knownEmail = location.state?.email || user?.email || ''
  const [email, setEmail] = useState(knownEmail)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)

  // already verified and logged in — nothing to do here
  if (user?.email_verified) return <Navigate to={pathForStage(stageOf(user))} replace />

  async function handleResend(e) {
    e?.preventDefault()
    if (sending || !email.trim()) return
    setSending(true)
    setError(null)
    const result = await resendVerification(email.trim())
    setSending(false)
    if (result.error) setError(result.error)
    else setMessage(result.message)
  }

  async function handleContinue() {
    // clear any leftover pre-verification session, then log in properly
    if (user) await logout()
    navigate('/login', { replace: true })
  }

  return (
    <AuthLayout
      title="VERIFICATION REQUIRED"
      subtitle={knownEmail
        ? `A VERIFICATION LINK WAS SENT TO ${knownEmail.toUpperCase()}`
        : 'CHECK YOUR INBOX FOR YOUR VERIFICATION LINK'}
    >
      <p className="setup-greeting auth-subtitle">
        Click the link in the email to activate your account, then log in.
      </p>

      {!knownEmail && (
        <form className="auth-form" onSubmit={handleResend} noValidate>
          <AuthField
            label="EMAIL" id="verify-email" type="email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} maxLength={254}
          />
        </form>
      )}

      <AuthMessage error={error} message={message} />

      <button className="auth-btn" type="button" onClick={handleContinue}>Log in</button>

      <div className="auth-links">
        <button className="auth-link auth-link-btn" type="button" onClick={handleResend} disabled={sending || !email.trim()}>
          {sending ? 'Sending...' : 'Resend the link'}
        </button>
      </div>
    </AuthLayout>
  )
}

export default VerifyPendingPage
