import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout, { AuthMessage } from './AuthLayout'
import { resendVerification } from '../../api'
import { useAuth, stageOf, pathForStage } from '../../auth/AuthContext'

// Shown to logged-in users who haven't verified their email yet. The API also
// refuses every game route for them, so this isn't just a UI gate.
function VerifyPendingPage() {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function handleResend() {
    setError(null)
    const result = await resendVerification(user.email)
    if (result.error) setError(result.error)
    else setMessage(result.message)
  }

  // after clicking the link in another tab, re-check the session here
  async function handleContinue() {
    setError(null)
    const fresh = await refresh()
    if (fresh?.email_verified) navigate(pathForStage(stageOf(fresh)), { replace: true })
    else setError('Your email is not verified yet. Check your inbox for the link.')
  }

  return (
    <AuthLayout title="VERIFICATION REQUIRED" subtitle={`A VERIFICATION LINK WAS SENT TO ${user.email.toUpperCase()}`}>
      <p className="setup-greeting auth-subtitle">The system stays locked until your email is confirmed.</p>

      <AuthMessage error={error} message={message} />

      <button className="auth-btn" type="button" onClick={handleContinue}>I've verified</button>

      <div className="auth-links">
        <button className="auth-link auth-link-btn" type="button" onClick={handleResend}>Resend the link</button>
        <button className="auth-link auth-link-btn" type="button" onClick={logout}>Log out</button>
      </div>
    </AuthLayout>
  )
}

export default VerifyPendingPage
