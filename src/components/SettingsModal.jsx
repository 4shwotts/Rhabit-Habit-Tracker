import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { deleteAccount } from '../api'
import TwoFactorPanel from './TwoFactorPanel'
import ModalFrame from './ModalFrame'

// game settings live in HomePage and get passed down; the account section
// (log out / delete account) talks to the auth context directly
function SettingsModal({ onClose, settings, onToggle }) {
  const { user, logout, setUser } = useAuth()
  const twoFactorOn = !!user?.two_factor_enabled
  // the 2FA setup/turn-off flow replaces the settings list while it's open
  const [showTwoFactor, setShowTwoFactor] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // the server re-checks the password, then cascades the delete to every goal,
  // task, daily state and penalty that belongs to this account
  async function handleDelete(e) {
    e.preventDefault()
    if (deleting || !password || (twoFactorOn && !deleteCode.trim())) return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteAccount(password, twoFactorOn ? deleteCode.trim() : undefined)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    setUser(null) // route guard then sends the user to the login page
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-box" onClick={(e) => e.stopPropagation()}>

        <ModalFrame className="penalty-frame" />

        <div className="settings-content">
          {showTwoFactor ? (
            <TwoFactorPanel onDone={() => setShowTwoFactor(false)} />
          ) : (
          <>
          <div className="setting-row">
            <span className="setting-label">Timer visibility</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.timerVisible}
              aria-label="Timer visibility"
              className={`settings-toggle ${settings.timerVisible ? 'on' : ''}`}
              onClick={() => onToggle('timerVisible')}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>

          <div className="setting-row">
            <span className="setting-label">Task Refresh Allowance</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.taskRefresh}
              aria-label="Task Refresh Allowance"
              className={`settings-toggle ${settings.taskRefresh ? 'on' : ''}`}
              onClick={() => onToggle('taskRefresh')}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>

          <div className="setting-row">
            <span className="setting-label">Pause Progression</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.pauseProgression}
              aria-label="Pause Progression"
              className={`settings-toggle ${settings.pauseProgression ? 'on' : ''}`}
              onClick={() => onToggle('pauseProgression')}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>

          <div className="setting-row">
            <span className="setting-label">
              Two-step sign-in
              <span className={`twofa-status ${twoFactorOn ? 'on' : ''}`}>{twoFactorOn ? 'On' : 'Off'}</span>
            </span>
            <button className="settings-account-btn" type="button" onClick={() => setShowTwoFactor(true)}>
              {twoFactorOn ? 'Turn off' : 'Set up'}
            </button>
          </div>

          {confirmingDelete ? (
            <form className="settings-delete-confirm" onSubmit={handleDelete}>
              <p className="settings-delete-warning">
                This permanently deletes your account and all of your progress. Enter your password to confirm.
              </p>
              <input
                className="setup-input auth-input"
                type="password"
                autoComplete="current-password"
                aria-label="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                maxLength={128}
                autoFocus
              />
              {twoFactorOn && (
                <input
                  className="setup-input auth-input"
                  type="text"
                  autoComplete="one-time-code"
                  aria-label="Authenticator or backup code"
                  placeholder="Authenticator code"
                  value={deleteCode}
                  onChange={e => setDeleteCode(e.target.value)}
                  maxLength={12}
                />
              )}
              {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
              <div className="settings-account">
                <button
                  className="settings-account-btn danger"
                  type="submit"
                  disabled={deleting || !password || (twoFactorOn && !deleteCode.trim())}
                >
                  {deleting ? 'Deleting...' : 'Delete permanently'}
                </button>
                <button
                  className="settings-account-btn"
                  type="button"
                  onClick={() => { setConfirmingDelete(false); setPassword(''); setDeleteCode(''); setDeleteError(null) }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="settings-account">
              <button className="settings-account-btn" type="button" onClick={logout}>Log out</button>
              <button className="settings-account-btn danger" type="button" onClick={() => setConfirmingDelete(true)}>
                Delete account
              </button>
            </div>
          )}
          </>
          )}
        </div>

      </div>
    </div>
  )
}

export default SettingsModal