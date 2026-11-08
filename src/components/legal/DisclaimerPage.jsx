import { Link } from 'react-router-dom'
import AuthLayout from '../auth/AuthLayout'
import { useAuth } from '../../auth/AuthContext'
import { CONTACT_EMAIL } from './contact'

// A short disclaimer: Rhabit is a portfolio project, provided as it is.
function DisclaimerPage() {
  const { publicSignup } = useAuth()

  return (
    <AuthLayout title="DISCLAIMER" subtitle="A PORTFOLIO PROJECT">
      <article className="legal">
        <section>
          <ul>
            <li>Rhabit is a portfolio project. It is provided as it is, with no guarantees of any kind.</li>
            <li>It may be unavailable at times, or change without notice.</li>
            <li>
              Data may be reset or deleted at any time. Demo accounts are always deleted after 24 hours. Please don&apos;t
              rely on Rhabit to keep anything important.
            </li>
            <li>
              Tasks and penalties are game challenges, not health or fitness advice. Only do what is safe for you.
            </li>
            <li>
              {publicSignup
                ? 'Public sign-up is currently open.'
                : 'Public sign-up is closed on the live site. The demo is the way to try it.'}
            </li>
          </ul>
          <p>
            Questions: <a className="auth-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </section>
      </article>

      <div className="auth-links">
        <Link className="auth-link" to="/privacy">Privacy notice</Link>
        <Link className="auth-link" to="/">Back to Rhabit</Link>
      </div>
    </AuthLayout>
  )
}

export default DisclaimerPage
