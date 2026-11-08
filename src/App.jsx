import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SetupPage from './components/SetupPage'
import HomePage from './components/HomePage'
import GoalsPage from './components/GoalsPage'
import LoginPage from './components/auth/LoginPage'
import SignupPage from './components/auth/SignupPage'
import VerifyPendingPage from './components/auth/VerifyPendingPage'
import VerifyEmailPage from './components/auth/VerifyEmailPage'
import ForgotPasswordPage from './components/auth/ForgotPasswordPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import DemoStartPage from './components/auth/DemoStartPage'
import PrivacyPage from './components/legal/PrivacyPage'
import DisclaimerPage from './components/legal/DisclaimerPage'
import { AuthProvider, useAuth, stageOf, pathForStage } from './auth/AuthContext'
import RequireStage from './auth/RequireStage'
import TextureBackground from './components/TextureBackground'
import DemoBanner from './components/DemoBanner'
import BootScreen from './components/BootScreen'

function AppRoutes() {
  const { user, checking } = useAuth()

  // wait for the session check so guards don't flash the login page
  if (checking) return <BootScreen />

  return (
    <>
    {user?.is_demo && <DemoBanner />}
    <Routes>
      <Route path="/" element={<Navigate to={pathForStage(stageOf(user))} replace />} />

      {/* logged-out only */}
      <Route path="/login" element={<RequireStage stage="guest"><LoginPage /></RequireStage>} />
      {/* stays on show when public sign-up is closed: the form is disabled
          and points visitors to the demo (see SignupPage) */}
      <Route path="/signup" element={<RequireStage stage="guest"><SignupPage /></RequireStage>} />

      {/* reachable from emailed links (and the login page) whatever the session state */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-pending" element={<VerifyPendingPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* readable by anyone, logged in or not */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/disclaimer" element={<DisclaimerPage />} />

      {/* a portfolio's "Live demo" link: starts a demo and goes straight to Home */}
      <Route path="/demo" element={<DemoStartPage />} />

      {/* logged in */}
      <Route path="/setup" element={<RequireStage stage="setup"><SetupPage /></RequireStage>} />
      <Route path="/home" element={<RequireStage stage="app"><HomePage /></RequireStage>} />
      <Route path="/goals" element={<RequireStage stage="app"><GoalsPage /></RequireStage>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      {/* animated digital-rain background, behind every page */}
      <TextureBackground />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
