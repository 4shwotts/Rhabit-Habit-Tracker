import { useSlowRequest, WakingNotice } from './ServerStatus'

// Shown while the app first checks the session with the server. If that takes
// a while (a sleeping server), it says the server is waking.
function BootScreen() {
  const slow = useSlowRequest(0)
  return (
    <div className="boot-screen">
      <span>BOOTING SYSTEM...</span>
      {slow && <WakingNotice />}
    </div>
  )
}

export default BootScreen
