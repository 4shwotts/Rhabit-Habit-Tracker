import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getMe, logout as apiLogout, getAuthConfig, startDemo as apiStartDemo } from '../api'

// Holds the current session user (from GET /api/auth/me) for the whole app.
// The server is the source of truth — this only decides which page to show.
const AuthContext = createContext(null)

// Per-visit sessions: every new visit (new tab, a link from elsewhere, or a
// reopened browser) starts at the login page, even if a session cookie is still
// around. sessionStorage survives a refresh of the same tab but not a new tab,
// so a marker there means "this visit already logged in".
const VISIT_KEY = 'rhabit_visit_session'

function visitIsLoggedIn() {
  try { return sessionStorage.getItem(VISIT_KEY) === '1' } catch { return false }
}

function markVisitLoggedIn() {
  try { sessionStorage.setItem(VISIT_KEY, '1') } catch { /* storage blocked: session still works */ }
}

function clearVisit() {
  try { sessionStorage.removeItem(VISIT_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  // whether public sign-up is open (the server's PUBLIC_SIGNUP_ENABLED); assumed
  // open until the server says otherwise
  const [publicSignup, setPublicSignup] = useState(true)

  useEffect(() => {
    getAuthConfig().then(config => {
      if (typeof config.public_signup_enabled === 'boolean') setPublicSignup(config.public_signup_enabled)
    })
  }, [])

  // re-reads the session from the server, e.g. after login or verification
  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      // only called after an action in this tab (login, verify, setup)
      if (me) markVisitLoggedIn()
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // initial check on page load: a fresh visit drops this browser's leftover
  // cookie and starts at login (without signing out other devices); a refresh
  // of an already-logged-in tab carries on
  useEffect(() => {
    const check = visitIsLoggedIn()
      ? getMe()
      : apiLogout({ thisBrowserOnly: true }).catch(() => {}).then(() => null)
    check
      .then(me => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [])

  // api.js fires this when a game route answers 401 (expired/revoked session)
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('rhabit:session-expired', onExpired)
    return () => window.removeEventListener('rhabit:session-expired', onExpired)
  }, [])

  // logging out of a demo also deletes it (the server does that)
  const logout = useCallback(async () => {
    clearVisit()
    try { await apiLogout() } finally { setUser(null) }
  }, [])

  // one click: a new demo account, signed in. Resolves to the result, which has
  // an `error` if the demo couldn't start (busy, or too many from here).
  const startDemo = useCallback(async () => {
    let timezone
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* server uses UTC */ }
    const result = await apiStartDemo(timezone)
    if (result.user) {
      markVisitLoggedIn()
      setUser(result.user)
    }
    return result
  }, [])

  return (
    <AuthContext.Provider value={{ user, checking, refresh, logout, setUser, startDemo, publicSignup }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}

// Where a user belongs right now, based on how far through onboarding they are.
// eslint-disable-next-line react-refresh/only-export-components
export function stageOf(user) {
  if (!user) return 'guest'
  if (!user.email_verified) return 'unverified'
  if (!user.setup_complete) return 'setup'
  return 'app'
}

// eslint-disable-next-line react-refresh/only-export-components
export function pathForStage(stage) {
  return {
    guest: '/login',
    unverified: '/verify-pending',
    setup: '/setup',
    app: '/home'
  }[stage]
}
