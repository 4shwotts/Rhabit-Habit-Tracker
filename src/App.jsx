import './App.css'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SetupPage from './components/SetupPage'
import HomePage from './components/HomePage'
import GoalsPage from './components/GoalsPage'
import { getUser } from './api'

function App() {
  const [checking, setChecking] = useState(true)
  const [hasUser, setHasUser] = useState(false)

  // check if a user exists before rendering anything — avoids flash of wrong page
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
      <Routes>
        <Route path="/" element={hasUser ? <Navigate to="/home" /> : <Navigate to="/setup" />} />
        <Route path="/setup" element={!hasUser ? <SetupPage /> : <Navigate to="/home" />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/goals" element={<GoalsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App