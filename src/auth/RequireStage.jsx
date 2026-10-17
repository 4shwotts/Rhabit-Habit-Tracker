import { Navigate } from 'react-router-dom'
import { useAuth, stageOf, pathForStage } from './AuthContext'

// Route guard: renders its children only when the user is at the given stage
// ('guest', 'unverified', 'setup' or 'app'); otherwise redirects them to the page
// for the stage they're actually at. No session means the login page.
// This is a UX guard only — the API enforces auth on every route itself.
function RequireStage({ stage, children }) {
  const { user } = useAuth()
  const current = stageOf(user)
  if (current !== stage) return <Navigate to={pathForStage(current)} replace />
  return children
}

export default RequireStage
