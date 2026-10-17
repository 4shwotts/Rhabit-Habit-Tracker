import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout, { AuthField, AuthMessage } from './AuthLayout'
import { forgotPassword } from '../../api'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    // the response is the same whether or not the email has an account
    const result = await forgotPassword(email.trim())
    setSubmitting(false)
    if (result.error) setError(result.error)
    else setMessage(result.message)
  }

  return (
    <AuthLayout title="RECOVER ACCESS" subtitle="ENTER YOUR EMAIL AND WE'LL SEND YOU A RESET LINK">
      {message ? (
        <AuthMessage message={message} />
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <AuthField
            label="EMAIL" id="forgot-email" type="email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required
          />
          <AuthMessage error={error} />
          <button className="auth-btn" type="submit" disabled={submitting || !email}>
            {submitting ? 'Sending...' : 'Send link'}
          </button>
        </form>
      )}

      <div className="auth-links">
        <Link className="auth-link" to="/login">Back to log in</Link>
      </div>
    </AuthLayout>
  )
}

export default ForgotPasswordPage
