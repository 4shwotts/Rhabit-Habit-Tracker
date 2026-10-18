import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { deleteAccount } from '../api'
import TwoFactorPanel from './TwoFactorPanel'

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

        <svg
          className="penalty-frame"
          viewBox="0 0 1100 696"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="14.3869" y="15.3022" width="1070.09" height="661.091" rx="32.0457"
            fill="#382A60" fillOpacity="0.2" stroke="#916FF1" strokeWidth="3.90864"/>
          <path d="M32.6047 8.00768C29.6231 8.0098 26.8897 9.67117 25.5134 12.3179L7.96124 46.0715C4.22638 53.2538 12.2915 60.8055 19.2076 56.6019L74.7854 22.8212C81.7015 18.6175 78.7218 7.97484 70.6304 7.9806L32.6047 8.00768Z" fill="#1C1927"/>
          <path d="M32.604 6.50708C29.0634 6.5096 25.8174 8.48258 24.183 11.6254L6.63093 45.3795C2.19595 53.9084 11.7735 62.8756 19.9862 57.8838L75.5636 24.1034C83.7763 19.1117 80.2383 6.47367 70.6301 6.48021L32.604 6.50708Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M1066.56 8.00768C1069.54 8.0098 1072.27 9.67117 1073.65 12.3179L1091.2 46.0715C1094.94 53.2538 1086.87 60.8055 1079.96 56.6019L1024.38 22.8212C1017.46 18.6175 1020.44 7.97484 1028.53 7.9806L1066.56 8.00768Z" fill="#1C1927"/>
          <path d="M1066.56 6.50708C1070.1 6.5096 1073.35 8.48258 1074.98 11.6254L1092.53 45.3795C1096.97 53.9084 1087.39 62.8756 1079.18 57.8838L1023.6 24.1034C1015.39 19.1117 1018.93 6.47367 1028.53 6.48021L1066.56 6.50708Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M1066.56 684.282C1069.54 684.28 1072.27 682.618 1073.65 679.972L1091.2 646.218C1094.94 639.036 1086.87 631.484 1079.96 635.688L1024.38 669.468C1017.46 673.672 1020.44 684.315 1028.53 684.309L1066.56 684.282Z" fill="#1C1927"/>
          <path d="M1066.56 685.782C1070.1 685.78 1073.35 683.807 1074.98 680.664L1092.53 646.91C1096.97 638.381 1087.39 629.414 1079.18 634.406L1023.6 668.186C1015.39 673.178 1018.93 685.816 1028.53 685.809L1066.56 685.782Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M32.6047 684.282C29.6231 684.28 26.8897 682.618 25.5134 679.972L7.96124 646.218C4.22638 639.036 12.2915 631.484 19.2076 635.688L74.7854 669.468C81.7015 673.672 78.7218 684.315 70.6304 684.309L32.6047 684.282Z" fill="#1C1927"/>
          <path d="M32.604 685.782C29.0634 685.78 25.8174 683.807 24.183 680.664L6.63093 646.91C2.19595 638.381 11.7735 629.414 19.9862 634.406L75.5636 668.186C83.7763 673.178 80.2383 685.816 70.6301 685.809L32.604 685.782Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M553.32 56.0349C550.674 57.7379 547.275 57.7311 544.635 56.0176L485.601 17.7103C478.91 13.3685 481.99 2.98423 489.965 3.00012L608.142 3.23567C616.116 3.25156 619.166 13.648 612.463 17.9632L553.32 56.0349Z" fill="#1C1927"/>
          <path d="M554.132 57.2963C550.991 59.3185 546.954 59.3104 543.819 57.2757L484.785 18.9685C476.84 13.8125 480.498 1.48142 489.967 1.50029L608.144 1.73584C617.613 1.75471 621.236 14.1003 613.276 19.2246L554.132 57.2963Z" stroke="#916FF1" strokeWidth="3"/>
        </svg>

        <div className="settings-content">
          {showTwoFactor ? (
            <TwoFactorPanel onDone={() => setShowTwoFactor(false)} />
          ) : (
          <>
          <div className="setting-row">
            <span className="setting-label">Timer visibility</span>
            <div
              className={`settings-toggle ${settings.timerVisible ? 'on' : ''}`}
              onClick={() => onToggle('timerVisible')}
            >
              <div className="settings-toggle-thumb" />
            </div>
          </div>

          <div className="setting-row">
            <span className="setting-label">Task Refresh Allowance</span>
            <div
              className={`settings-toggle ${settings.taskRefresh ? 'on' : ''}`}
              onClick={() => onToggle('taskRefresh')}
            >
              <div className="settings-toggle-thumb" />
            </div>
          </div>

          <div className="setting-row">
            <span className="setting-label">Pause Progression</span>
            <div
              className={`settings-toggle ${settings.pauseProgression ? 'on' : ''}`}
              onClick={() => onToggle('pauseProgression')}
            >
              <div className="settings-toggle-thumb" />
            </div>
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