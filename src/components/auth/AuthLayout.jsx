import logo from '../../assets/icons/Rhabit Logo.svg'
import cornerFrame from '../../assets/images/cornerframe.svg'

// Shared frame for every account page: corner brackets, logo and a HUD-style
// heading, matching the setup page.
function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="setup-page auth-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      <div className="auth-content">
        <img src={logo} className="setup-logo" alt="Rhabit" />
        <h1 className="auth-title" aria-label={title}>
          {/* each letter gets a slight, fixed tilt/offset (see .auth-title-char) */}
          {[...title].map((char, i) => (
            <span key={i} className="auth-title-char" aria-hidden="true">
              {char === ' ' ? ' ' : char}
            </span>
          ))}
        </h1>
        {subtitle && <p className="setup-greeting auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

// A labelled pill input in the setup-page style.
export function AuthField({ label, id, ...inputProps }) {
  return (
    <div className="setup-field auth-field">
      <label className="setup-label auth-label" htmlFor={id}>{label}</label>
      <input id={id} className="setup-input auth-input" {...inputProps} />
    </div>
  )
}

// Inline feedback: role="alert" for errors so screen readers announce them.
export function AuthMessage({ error, message }) {
  if (error) return <p className="auth-error" role="alert">{error}</p>
  if (message) return <p className="auth-message" role="status">{message}</p>
  return null
}

export default AuthLayout
