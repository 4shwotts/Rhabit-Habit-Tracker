import './App.css'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SetupPage from './components/SetupPage'
import HomePage from './components/HomePage'
import GoalsPage from './components/GoalsPage'
import { getUser, resetDemo } from './api'

function DemoBanner() {
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    await resetDemo()
    window.location.href = '/'
  }

  return (
    <div style={{
      width: '100%',
      background: 'rgba(145, 111, 241, 0.12)',
      borderBottom: '1px solid rgba(145, 111, 241, 0.3)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      fontFamily: 'Alumni Sans, sans-serif',
      fontSize: '18px',
      color: '#C1AAFF',
      letterSpacing: '0.3px',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 100,
      boxSizing: 'border-box'
    }}>
      <span>This is a live demo — data is shared and resets nightly at midnight.</span>
      <button
        onClick={handleReset}
        disabled={resetting}
        style={{
          background: 'rgba(145, 111, 241, 0.2)',
          border: '1px solid #916FF1',
          borderRadius: '20px',
          color: '#C1AAFF',
          fontFamily: 'Alumni Sans, sans-serif',
          fontSize: '16px',
          padding: '4px 16px',
          cursor: resetting ? 'not-allowed' : 'pointer',
          opacity: resetting ? 0.5 : 1,
          letterSpacing: '0.3px'
        }}
      >
        {resetting ? 'Resetting...' : 'Reset Demo'}
      </button>
    </div>
  )
}

function App() {
  const [checking, setChecking] = useState(true)
  const [hasUser, setHasUser] = useState(false)

  useEffect(() => {
    getUser().then(user => {
      setHasUser(!!user)
      setChecking(false)
    })
  }, [])

  if (checking) return (
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

  return (
    <BrowserRouter>
      <DemoBanner />
      <div style={{ paddingTop: '44px' }}>
        <Routes>
          <Route path="/" element={hasUser ? <Navigate to="/home" /> : <Navigate to="/setup" />} />
          <Route path="/setup" element={!hasUser ? <SetupPage /> : <Navigate to="/home" />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/goals" element={<GoalsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App