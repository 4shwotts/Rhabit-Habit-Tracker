import { Link } from 'react-router-dom'
import AuthLayout from '../auth/AuthLayout'
import { useAuth } from '../../auth/AuthContext'
import { CONTACT_EMAIL } from './contact'

// The privacy notice, written for UK GDPR. Every statement here matches what
// the code does; if the code changes (for example what is stored, which
// providers are used, or how long anything is kept), update this page too.
function PrivacyPage() {
  const { publicSignup } = useAuth()

  return (
    <AuthLayout title="PRIVACY NOTICE" subtitle="HOW RHABIT USES YOUR DATA">
      <article className="legal">
        <p className="legal-updated">Last updated: November 2026</p>

        <section>
          <h2>In short</h2>
          <p>
            Rhabit is a portfolio project. Most people use it through the demo, which holds no real personal data:
          </p>
          <ul>
            <li>A demo account gets a made-up address ending in <code>.invalid</code>, which can never receive email.</li>
            <li>No emails are ever sent from a demo account.</li>
            <li>A demo account and everything in it is deleted after 24 hours, or straight away when you end the demo or log out.</li>
          </ul>
          <p>
            {publicSignup
              ? 'Public sign-up is currently open. If you create a full account, the rest of this notice explains what is stored and why.'
              : 'Public sign-up is closed on the live site, so new full accounts cannot be created. A small number of full accounts made before sign-up closed may still exist, and the rest of this notice covers them too.'}
          </p>
        </section>

        <section>
          <h2>Who is responsible</h2>
          <p>
            Rhabit is run by one person as a personal project. That person is the data controller under UK GDPR.
            For any question or request about your data, email <a className="auth-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2>What is collected, and why</h2>
          <h3>Demo accounts</h3>
          <ul>
            <li>The goals, tasks, XP and settings you create or change while playing, so the game works.</li>
            <li>Your browser&apos;s time zone, so the daily reset happens at your midnight.</li>
            <li>A random demo address, the name &quot;Demo player&quot;, and when the demo started and ends.</li>
          </ul>
          <h3>Full accounts</h3>
          <ul>
            <li>Your email address, to log you in and send account emails (verification and password reset).</li>
            <li>Your username, shown on the Home screen.</li>
            <li>Your password, stored only as a one-way hash (bcrypt). The password itself is never stored.</li>
            <li>Your time zone and game data, as for demo accounts.</li>
            <li>
              If you turn on two-step sign-in: your authenticator secret, stored encrypted, and your backup codes,
              stored only as hashes.
            </li>
            <li>
              Links sent by email are stored only as hashes and expire: verification links after 24 hours, password
              reset links after 1 hour.
            </li>
            <li>
              When you sign up, the server looks up whether your email&apos;s domain can receive mail. Only the domain
              is checked.
            </li>
          </ul>
          <h3>IP addresses</h3>
          <p>
            To stop abuse, such as repeated login attempts, the server counts requests from each IP address for up to an
            hour. These counts are held only in the server&apos;s memory and are cleared when it restarts. Rhabit never
            saves IP addresses to its database or its own logs. The hosting providers below may record IP addresses in
            their own logs.
          </p>
          <h3>The legal basis</h3>
          <p>
            Data is used to provide the account and game you asked for, and to keep the service secure. Nothing is used
            for advertising, profiling or analytics, and nothing is sold or shared for marketing.
          </p>
        </section>

        <section>
          <h2>Cookies and browser storage</h2>
          <p>Rhabit only uses what it needs to keep you logged in. There are no analytics, advertising or tracking cookies:</p>
          <ul>
            <li><code>rhabit_session</code>: your login. It ends when you close the browser, and stops working after 12 hours.</li>
            <li><code>rhabit_2fa</code>: used only during a two-step sign-in, for up to 5 minutes.</li>
            <li>A small flag in this tab&apos;s session storage, so a refresh keeps you logged in. It goes when the tab closes.</li>
          </ul>
          <p>
            These are strictly necessary for the site to work, so there is no cookie banner. Rhabit loads no third-party
            scripts or fonts.
          </p>
        </section>

        <section>
          <h2>Who processes the data</h2>
          <ul>
            <li><strong>Vercel</strong> hosts the website and passes requests to the server.</li>
            <li><strong>Render</strong> runs the server.</li>
            <li><strong>Neon</strong> hosts the database.</li>
            <li><strong>Brevo</strong> sends account emails for full accounts. It receives the email address and the message. Demo accounts never use it.</li>
          </ul>
          <p>
            Your data may be stored or processed outside the UK by these providers. Each explains how it protects data in
            its own privacy policy.
          </p>
        </section>

        <section>
          <h2>How long it is kept</h2>
          <ul>
            <li>Demo accounts: 24 hours at most, then deleted with all their data.</li>
            <li>Full accounts: until the account is deleted.</li>
            <li>Emailed links: 24 hours for verification, 1 hour for password reset.</li>
            <li>Request counts by IP address: up to an hour, in memory only.</li>
          </ul>
        </section>

        <section>
          <h2>Deleting your account</h2>
          <ul>
            <li>Demo: choose <strong>End demo</strong> in Settings, or log out. It is deleted straight away.</li>
            <li>
              Full account: choose <strong>Delete account</strong> in Settings and confirm with your password (and your
              authenticator code if two-step sign-in is on). Everything is deleted at once.
            </li>
            <li>Or email <a className="auth-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and ask.</li>
          </ul>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            Under UK GDPR you can ask to see, correct or delete your data, or object to how it is used. Email
            {' '}<a className="auth-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you are not happy with the
            answer, you can complain to the Information Commissioner&apos;s Office at{' '}
            <a className="auth-link" href="https://ico.org.uk" rel="noopener noreferrer">ico.org.uk</a>.
          </p>
        </section>
      </article>

      <div className="auth-links">
        <Link className="auth-link" to="/disclaimer">Disclaimer</Link>
        <Link className="auth-link" to="/">Back to Rhabit</Link>
      </div>
    </AuthLayout>
  )
}

export default PrivacyPage
