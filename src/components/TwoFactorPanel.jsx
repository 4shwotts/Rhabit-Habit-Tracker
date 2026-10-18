import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { startTwoFactorSetup, enableTwoFactor, disableTwoFactor } from '../api'

// Settings panel for authenticator-app two-step sign-in.
// Turning on: password -> scan QR (or type the key) -> enter a code -> save backup codes.
// Turning off: password + a code (authenticator or backup).
function TwoFactorPanel({ onDone }) {
  const { user, refresh } = useAuth()
  const enabled = !!user?.two_factor_enabled
  // 'password' -> 'scan' -> 'backup' when turning on; 'disable' when turning off
  const [step, setStep] = useState(enabled ? 'disable' : 'password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState(null)
  const [backupCodes, setBackupCodes] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(action) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const handleStart = e => {
    e.preventDefault()
    run(async () => {
      const result = await startTwoFactorSetup(password)
      if (result.error) return setError(result.error)
      setSetup(result)
      setPassword('')
      setStep('scan')
    })
  }

  const handleEnable = e => {
    e.preventDefault()
    run(async () => {
      const result = await enableTwoFactor(code.trim())
      if (result.error) return setError(result.error)
      setBackupCodes(result.backup_codes)
      setCode('')
      setStep('backup')
      await refresh()
    })
  }

  const handleDisable = e => {
    e.preventDefault()
    run(async () => {
      const result = await disableTwoFactor(password, code.trim())
      if (result.error) return setError(result.error)
      await refresh()
      onDone()
    })
  }

  // backup codes as a .txt file the user can keep somewhere safe
  function downloadCodes() {
    const text = `Rhabit backup codes for ${user.email}\nEach code works once.\n\n${backupCodes.join('\n')}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'rhabit-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="twofa-panel">
      <h2 className="twofa-title">Two-step sign-in</h2>

      {step === 'password' && (
        <form className="twofa-form" onSubmit={handleStart}>
          <p className="twofa-text">
            Adds a 6-digit code from an authenticator app (Google Authenticator, Authy,
            1Password…) every time you log in. Enter your password to begin.
          </p>
          <input
            className="setup-input auth-input" type="password" autoComplete="current-password"
            aria-label="Password" placeholder="Password" maxLength={128} autoFocus
            value={password} onChange={e => setPassword(e.target.value)}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="settings-account">
            <button className="settings-account-btn" type="submit" disabled={busy || !password}>
              {busy ? 'Checking...' : 'Continue'}
            </button>
            <button className="settings-account-btn" type="button" onClick={onDone}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form className="twofa-form" onSubmit={handleEnable}>
          <p className="twofa-text">Scan this with your authenticator app, then enter the code it shows.</p>
          <img className="twofa-qr" src={setup.qr} alt="QR code for your authenticator app" width="180" height="180" />
          <p className="twofa-text small">
            Can't scan? Enter this key instead:
            <code className="twofa-key">{setup.manual_key.match(/.{1,4}/g).join(' ')}</code>
          </p>
          <input
            className="setup-input auth-input" type="text" inputMode="numeric" autoComplete="one-time-code"
            aria-label="6-digit code" placeholder="6-digit code" maxLength={6} autoFocus
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="settings-account">
            <button className="settings-account-btn" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking...' : 'Turn on'}
            </button>
            <button className="settings-account-btn" type="button" onClick={onDone}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'backup' && (
        <div className="twofa-form">
          <p className="twofa-text">
            Two-step sign-in is on. Save these backup codes somewhere safe — each one logs you in
            once if you lose your phone. They won't be shown again.
          </p>
          <ul className="twofa-codes">
            {backupCodes.map(c => <li key={c}><code>{c}</code></li>)}
          </ul>
          <div className="settings-account">
            <button className="settings-account-btn" type="button" onClick={downloadCodes}>Download codes</button>
            <button className="settings-account-btn" type="button" onClick={onDone}>Done</button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <form className="twofa-form" onSubmit={handleDisable}>
          <p className="twofa-text">
            Two-step sign-in is on. To turn it off, enter your password and a code from your
            authenticator app (or a backup code).
          </p>
          <input
            className="setup-input auth-input" type="password" autoComplete="current-password"
            aria-label="Password" placeholder="Password" maxLength={128} autoFocus
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <input
            className="setup-input auth-input" type="text" autoComplete="one-time-code"
            aria-label="Authenticator or backup code" placeholder="Code" maxLength={12}
            value={code} onChange={e => setCode(e.target.value)}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="settings-account">
            <button className="settings-account-btn danger" type="submit" disabled={busy || !password || !code.trim()}>
              {busy ? 'Checking...' : 'Turn off'}
            </button>
            <button className="settings-account-btn" type="button" onClick={onDone}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

export default TwoFactorPanel
