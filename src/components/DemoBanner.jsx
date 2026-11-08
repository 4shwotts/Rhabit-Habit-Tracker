import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// The thin strip across the top of the app in demo mode. Its height is shared
// as --demo-banner-height so small screens can move the page down to make room
// (see the end of App.css).
function DemoBanner() {
  const { publicSignup, logout } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    const el = ref.current
    const update = () => root.style.setProperty('--demo-banner-height', `${el.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--demo-banner-height')
    }
  }, [])

  // a demo can't become a real account, so signing up ends (deletes) the demo first
  async function signUp() {
    await logout()
    navigate('/signup')
  }

  return (
    <div className="demo-banner" role="region" aria-label="Demo mode" ref={ref}>
      <span>Demo mode: this account is temporary and resets after 24 hours.</span>
      {publicSignup && (
        <button className="demo-banner-link" type="button" onClick={signUp}>
          Sign up for a full account
        </button>
      )}
    </div>
  )
}

export default DemoBanner
