import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getMe, logout as apiLogout } from '../api'

// Holds the current session user (from GET /api/auth/me) for the whole app.
// The server is the source of truth — this only decides which page to show.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  // re-reads the session from the server, e.g. after login or verification
  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // initial session check on page load
  useEffect(() => {
    getMe()
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

  const logout = useCallback(async () => {
    try { await apiLogout() } finally { setUser(null) }
  }, [])

  return (
    <AuthContext.Provider value={{ user, checking, refresh, logout, setUser }}>
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
