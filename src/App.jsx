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
import { AuthProvider, useAuth, stageOf, pathForStage } from './auth/AuthContext'
import RequireStage from './auth/RequireStage'

function BootScreen() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#07070A',
      color: '#916FF1',
      fontFamily: 'Alumni Sans, sans-serif',
      fontSize: '32px',
      fontStyle: 'italic',
      letterSpacing: '-1px'
    }}>
      BOOTING SYSTEM...
    </div>
  )
}

function AppRoutes() {
  const { user, checking } = useAuth()

  // wait for the session check so guards don't flash the login page
  if (checking) return <BootScreen />

  return (
    <Routes>
      <Route path="/" element={<Navigate to={pathForStage(stageOf(user))} replace />} />

      {/* logged-out only */}
      <Route path="/login" element={<RequireStage stage="guest"><LoginPage /></RequireStage>} />
      <Route path="/signup" element={<RequireStage stage="guest"><SignupPage /></RequireStage>} />

      {/* reachable from emailed links (and the login page) whatever the session state */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-pending" element={<VerifyPendingPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* logged in */}
      <Route path="/setup" element={<RequireStage stage="setup"><SetupPage /></RequireStage>} />
      <Route path="/home" element={<RequireStage stage="app"><HomePage /></RequireStage>} />
      <Route path="/goals" element={<RequireStage stage="app"><GoalsPage /></RequireStage>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
