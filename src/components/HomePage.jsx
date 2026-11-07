import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useEffectEvent, useRef } from 'react'
import logo from '../assets/icons/Rhabit Logo.svg'
import settingsIcon from '../assets/icons/SettingsButton.svg'
import goalsIcon from '../assets/icons/GoalsButton.svg'
import cornerFrame from '../assets/images/cornerframe.svg'
import greetingsCard from '../assets/images/GreetingsCard.svg'
import mainBar from '../assets/images/MainBar.svg'
import xpBarBorder from '../assets/images/XPBarBorder.svg'
import SettingsModal from './SettingsModal'
import PenaltyModal from './PenaltyModal'
import {
  getUser, getGoals, getDaily, startDaily, checkTask,
  confirmDaily, refreshTask, triggerPenalty,
  failPenalty, updateSettings, markXpLossSeen
} from '../api'

// display only — the server decides what a refresh actually costs
const REFRESH_COST = 10
// how long to wait before asking for the penalty again if a request failed
const PENALTY_RETRY_MS = 5000
const XP_PER_LEVEL = 100
const MAX_LEVEL = 10
const NO_TIME_MESSAGE = 'You did not have enough time to save yourself at all, [username]'
const FAILED_MESSAGE = `You failed to do the tasks and you failed on the penalty task, you aren't worthy of this XP.`

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 5400 -> "1.5 hours"
function formatWindow(seconds) {
  const hours = seconds / 3600
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function HomePage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [goal, setGoal] = useState(null)
  const [dailyTasks, setDailyTasks] = useState([])
  const [dailyState, setDailyState] = useState(null)
  const [penaltyState, setPenaltyState] = useState(null)
  const [dissolvingIndices, setDissolvingIndices] = useState([])
  const [showTasksDone, setShowTasksDone] = useState(false)
  const [endMessage, setEndMessage] = useState(null)
  const [xpEarnedText, setXpEarnedText] = useState(null)
  const [refreshedIndices, setRefreshedIndices] = useState([])
  const [levelUpMsg, setLevelUpMsg] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [penaltyTriggeredByTimer, setPenaltyTriggeredByTimer] = useState(false)
  const [autoLaunchPenalty, setAutoLaunchPenalty] = useState(false)

  const [settings, setSettings] = useState({
    timerVisible: true,
    taskRefresh: false,
    pauseProgression: false
  })

  const [xp, setXp] = useState(0)
  const [level, setLevel] = useState(1)
  const [xpAnim, setXpAnim] = useState(0)
  const [timeLeft, setTimeLeft] = useState(null)
  // when today's window ends (ms since 1970), once it has started
  const [windowEndsAt, setWindowEndsAt] = useState(null)
  const [confirmUnlock, setConfirmUnlock] = useState(null)
  const [checked, setChecked] = useState([false, false, false])
  const [confirmed, setConfirmed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPenalty, setShowPenalty] = useState(false)
  const [spinningIndex, setSpinningIndex] = useState(null)

  const timerRef = useRef(null)
  const clockRef = useRef(null)
  // tick syncing: what the user last chose (updated instantly on click), what
  // the server last accepted, and which tasks have a request in flight
  const checkedRef = useRef([false, false, false])
  const savedCheckedRef = useRef([false, false, false])
  const checkInFlight = useRef(new Set())
  // asking for the penalty: never while a request is in flight or once it has
  // started, and a refused request is retried every few seconds, not every tick
  const penaltyRequest = useRef({ busy: false, started: false, last: 0 })

  useEffect(() => {
    let lastDate = new Date().toDateString()
    clockRef.current = setInterval(() => {
      const now = new Date()
      setCurrentTime(now)
      if (now.toDateString() !== lastDate) {
        lastDate = now.toDateString()
        window.location.reload()
      }
    }, 1000)
    return () => clearInterval(clockRef.current)
  }, [])

  function formatClock(date, timezone) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      }).format(date)
    } catch {
      return date.toLocaleTimeString('en-GB', { hour12: false })
    }
  }

  function showEndState(message, username) {
    setEndMessage(message.replace('[username]', username || ''))
    setTimeout(() => {
      setEndMessage(null)
      setShowTasksDone(true)
    }, 10000)
  }

  // XP the server took while the player wasn't watching: the bar starts where
  // it was and eases down, and the server stops reporting it once it's shown
  function animateXpLoss({ amount, xp: newXp, level: newLevel }) {
    setXp(newXp)
    setLevel(newLevel)
    setXpAnim(Math.min(XP_PER_LEVEL, newXp + amount))
    setTimeout(() => { markXpLossSeen() }, 2000)
  }

  useEffect(() => {
    async function load() {
      try {
        const [userData, dailyData] = await Promise.all([getUser(), getDaily()])
        // no user means the session has expired — AuthContext redirects to login
        if (!userData) return

        setUser(userData)
        setSettings({
          timerVisible: !!userData.timer_visible,
          taskRefresh: !!userData.task_refresh,
          pauseProgression: !!userData.pause_progression
        })

        // `outcome` is anything the server settled on this load: a missed window,
        // an expired penalty, or opening the app too late in the day
        const { state, tasks, penalty, windowSeconds: ws, confirmUnlockBeforeEnd, outcome, xpLoss } = dailyData
        setDailyTasks(tasks)
        setDailyState(state)
        setPenaltyState(penalty)

        let activeGoal = null
        if (userData.active_goal_id) {
          const goals = await getGoals()
          activeGoal = goals.find(g => g.id === userData.active_goal_id)
          if (activeGoal) {
            setGoal(activeGoal)
            setXp(activeGoal.xp)
            setXpAnim(activeGoal.xp)
            setLevel(activeGoal.level)
          }
        }

        if (xpLoss) animateXpLoss(xpLoss)

        // yesterday was left unfinished: today carries on as normal
        if (xpLoss?.reason === 'missed_day') {
          setLevelUpMsg(`SYSTEM NOTICE — You abandoned your tasks and lost ${xpLoss.amount} XP`)
          setTimeout(() => setLevelUpMsg(null), 8000)
        }

        if (xpLoss?.reason === 'late' || xpLoss?.reason === 'penalty') {
          setConfirmed(true)
          showEndState(xpLoss.reason === 'late' ? NO_TIME_MESSAGE : FAILED_MESSAGE, userData.username)
          setDissolvingIndices([0, 1, 2])
          setLoading(false)
          return
        }

        const alreadyConfirmed = !!state?.confirmed
        setConfirmed(alreadyConfirmed)
        if (alreadyConfirmed) {
          setShowTasksDone(true)
          setLoading(false)
          return
        }

        if (penalty?.active) {
          setPenaltyTriggeredByTimer(true)
          // server found it was too late to start today and launched a penalty instead
          if (outcome === 'late_penalty') {
            setAutoLaunchPenalty(true)
            setConfirmed(true)
          }
          setDissolvingIndices([0, 1, 2])
          setShowPenalty(true)
          setLoading(false)
          return
        }

        if (state?.started && state?.window_start) {
          const elapsed = Math.floor((Date.now() - new Date(state.window_start)) / 1000)
          const remaining = Math.max(0, ws - elapsed)
          setTimeLeft(remaining)
          setWindowEndsAt(new Date(state.window_start).getTime() + ws * 1000)
          const confirmUnlockAt = ws - confirmUnlockBeforeEnd
          const confirmRemaining = Math.max(0, confirmUnlockAt - elapsed)
          setConfirmUnlock(confirmRemaining)
        } else {
          setTimeLeft(ws)
          setConfirmUnlock(Math.max(0, ws - confirmUnlockBeforeEnd))
        }

        const serverChecked = tasks.map(t => !!t.checked)
        checkedRef.current = [...serverChecked]
        savedCheckedRef.current = [...serverChecked]
        setChecked(serverChecked)
        setRefreshedIndices(tasks.map((t, i) => t.refreshed ? i : null).filter(i => i !== null))

      } catch (err) {
        console.error('Failed to load homepage:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate])

  // the XP bar eases towards the real value, snapping to it once close enough
  useEffect(() => {
    if (xpAnim === xp) return
    const diff = xp - xpAnim
    const t = setTimeout(() => setXpAnim(Math.abs(diff) < 0.5 ? xp : xpAnim + diff * 0.1), 16)
    return () => clearTimeout(t)
  }, [xp, xpAnim])

  // counts down to the confirm button unlocking, once that time is known
  const confirmCountdownReady = confirmUnlock !== null
  useEffect(() => {
    if (!dailyState?.started || confirmed || !confirmCountdownReady) return
    const countdown = setInterval(() => setConfirmUnlock(prev => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(countdown)
  }, [dailyState?.started, confirmed, confirmCountdownReady])

  async function handleStart() {
    if (settings.pauseProgression) return
    try {
      const result = await startDaily()
      if (result.error) return
      setWindowEndsAt(Date.now() + (result.windowSeconds ?? timeLeft) * 1000)
      setDailyState(prev => ({ ...prev, started: 1, window_start: result.window_start }))
    } catch (err) {
      console.error('Failed to start:', err)
    }
  }

  // Ticks show instantly. Requests for one task are sent one at a time, and
  // when one finishes the latest choice is sent if it changed meanwhile, so
  // fast clicks can't arrive out of order and leave the server out of step.
  function handleCheck(index) {
    if (!dailyState?.started || confirmed) return
    const next = [...checkedRef.current]
    next[index] = !next[index]
    checkedRef.current = next
    setChecked(next)
    syncCheck(index)
  }

  async function syncCheck(index) {
    if (checkInFlight.current.has(index)) return
    checkInFlight.current.add(index)
    try {
      while (checkedRef.current[index] !== savedCheckedRef.current[index]) {
        const want = checkedRef.current[index]
        const result = await checkTask(dailyTasks[index].id, want)
        if (result.error) {
          // refused (e.g. the window closed): fall back to what the server has
          checkedRef.current = checkedRef.current.map((c, i) => (i === index ? savedCheckedRef.current[index] : c))
          setChecked(checkedRef.current)
          break
        }
        savedCheckedRef.current[index] = want
      }
    } finally {
      checkInFlight.current.delete(index)
    }
  }

  async function handleConfirm() {
    if (!canConfirm || settings.pauseProgression) return
    // let any tick still being saved reach the server first
    for (let i = 0; i < 60 && checkInFlight.current.size > 0; i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    try {
      const result = await confirmDaily()
      if (result.error) return

      setXp(result.xp)
      setLevel(result.level)
      setConfirmed(true)
      clearInterval(timerRef.current)

      if (!penaltyTriggeredByTimer) {
        setXpEarnedText(`+${result.xp_earned}XP`)
        setTimeout(() => {
          setXpEarnedText(null)
          setShowTasksDone(true)
        }, 2500)
      } else {
        setShowTasksDone(true)
      }

      setDissolvingIndices([0])
      setTimeout(() => setDissolvingIndices([0, 1]), 200)
      setTimeout(() => setDissolvingIndices([0, 1, 2]), 400)

      // only the server knows the tasks that set the window, so it says if it's changing
      if (result.new_window_seconds) {
        setTimeout(() => {
          setLevelUpMsg(`SYSTEM UPDATE — Your daily window is now ${formatWindow(result.new_window_seconds)}`)
          setTimeout(() => setLevelUpMsg(null), 5000)
        }, 3000)
      }

    } catch (err) {
      console.error('Failed to confirm:', err)
    }
  }

  async function handleTriggerPenalty() {
    const req = penaltyRequest.current
    req.busy = true
    req.last = Date.now()
    try {
      const result = await triggerPenalty()
      const fresh = await getDaily()
      // no time left for a penalty today: the XP has gone straight away
      if (fresh.xpLoss) {
        req.started = true
        setConfirmed(true)
        animateXpLoss(fresh.xpLoss)
        showEndState(NO_TIME_MESSAGE, user?.username)
        setDissolvingIndices([0, 1, 2])
        return
      }
      // refused or failed: keep the pop-up closed; the window timer asks again
      if (!fresh.penalty?.active) {
        console.error('Penalty did not start:', result.error || 'no active penalty')
        return
      }
      req.started = true
      setPenaltyState(fresh.penalty)
      setPenaltyTriggeredByTimer(true)
      setConfirmed(true)
      setDissolvingIndices([0])
      setTimeout(() => setDissolvingIndices([0, 1]), 150)
      setTimeout(() => setDissolvingIndices([0, 1, 2]), 300)
      setTimeout(() => setShowPenalty(true), 500)
    } catch (err) {
      console.error('Failed to trigger penalty:', err)
    } finally {
      req.busy = false
    }
  }

  // always the latest version, without restarting the timer on every render
  const askForPenalty = useEffectEvent(handleTriggerPenalty)

  // The window timer. Each second it works out what's left from the stored end
  // time, so it can't drift and still notices a window that ended while the
  // page was loading. Once time is up without a confirm it asks for the penalty:
  // ticking every task isn't enough, the player has to confirm them too.
  useEffect(() => {
    if (!dailyState?.started || confirmed || windowEndsAt === null) return

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((windowEndsAt - Date.now()) / 1000))
      setTimeLeft(left)
      if (left > 0) return
      const req = penaltyRequest.current
      if (req.busy || req.started || Date.now() - req.last < PENALTY_RETRY_MS) return
      askForPenalty()
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [dailyState?.started, confirmed, windowEndsAt])

  async function handlePenaltyFail() {
    try {
      const result = await failPenalty()
      if (result.error) {
        console.error('Failed penalty:', result.error)
        return
      }
      // the bar eases down to the new value
      setXp(result.xp)
      setLevel(result.level)
      setShowPenalty(false)

      if (autoLaunchPenalty) {
        showEndState(
          `You ran out of time in the day to complete your tasks. We gave you a second chance but you still FAILED us, we shall take away what you worked hard for, [username]`,
          user?.username
        )
      } else {
        showEndState(FAILED_MESSAGE, user?.username)
      }
    } catch (err) {
      console.error('Failed penalty:', err)
    }
  }

  async function handlePenaltySuccess() {
    setShowPenalty(false)
    setShowTasksDone(true)
  }

  async function handleRefresh(index) {
    if (confirmed || checked[index] || refreshedIndices.includes(index)) return
    const task = dailyTasks[index]

    setSpinningIndex(index)
    setTimeout(() => setSpinningIndex(null), 600)

    try {
      const result = await refreshTask(task.id)
      if (result.error) return

      const updatedTasks = [...dailyTasks]
      updatedTasks[index] = { ...updatedTasks[index], ...result.task, id: task.id }
      setDailyTasks(updatedTasks)
      setRefreshedIndices(prev => [...prev, index])

      if (!settings.taskRefresh) {
        setXp(result.xp)
        setLevel(result.level)
      }
    } catch (err) {
      console.error('Failed to refresh task:', err)
    }
  }

  async function handleToggle(key) {
    const newSettings = { ...settings, [key]: !settings[key] }
    setSettings(newSettings)
    await updateSettings({
      timer_visible: newSettings.timerVisible,
      task_refresh: newSettings.taskRefresh,
      pause_progression: newSettings.pauseProgression
    })
  }

  // levels 4–10 are optional at setup, so the newest unlocked task level can be
  // empty — point the user to Goals to fill it in
  const unlockedTier = Math.min(level, MAX_LEVEL)
  const emptyTier = !!goal && !(goal.levelTasks?.[unlockedTier] || []).some(t => t.title?.trim())

  // a full bar at the top level ends the pathway, once today's tasks are done
  const pathwayComplete = level >= MAX_LEVEL && xp >= XP_PER_LEVEL
  const showPathwayEnd = pathwayComplete && (showTasksDone || dailyTasks.length === 0)

  // confirming needs every task ticked as well as the unlock time
  const allTicked = dailyTasks.every((_, i) => checked[i])
  const canConfirm = confirmUnlock === 0 && !confirmed && allTicked
  const xpPercent = Math.min(xpAnim, 100) / 100
  const started = !!dailyState?.started

  if (loading) return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#07070A', color: '#916FF1',
      fontFamily: 'var(--font-body)', fontSize: '32px',
      fontStyle: 'normal', letterSpacing: '0'
    }}>
      LOADING...
    </div>
  )

  return (
    <div className="home-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      {levelUpMsg && <div className="home-banner" role="status">⚡ {levelUpMsg}</div>}

      <div className="home-content">
        <div className="home-header-bar">
          <div className="home-main-bar-bg" />
          <img src={mainBar} className="home-main-bar" alt="" />
          <img src={greetingsCard} className="home-greetings-card" alt="" />
          {/* small screens: the same two shapes, stretched to fit, with an even outline */}
          <svg className="home-phone-bar" viewBox="0 0 1572 145" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M1489.77 143.272L1567.22 36.209L1568.94 33.8291H219.609L2.21657 1.98735L0.528001 36.8291H10.113L143.464 110.791L161.108 143.272H1489.77Z"
              fill="#191329" fillOpacity="0.85" stroke="#7B62D6" strokeWidth="2" vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg className="home-phone-card" viewBox="0 0 741 95" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M688.242 92.0118L733.99 29.2535L736.206 26.2135L87.7003 2.01348L10.3624 14.323L8.69257 16.1188L2.36649 89.8331L2.17964 92.0118H688.242Z"
              fill="#191329" fillOpacity="0.92" stroke="#916FF1" strokeWidth="2" vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="home-greetings-content">
            <div className="home-logo-circle">
              <img src={logo} className="home-logo" alt="Rhabit" />
            </div>
            <div className="home-header-text">
              <p className="home-welcome">Welcome, {user?.username}</p>
            </div>
          </div>

          <div className="home-title-content">
            <p className="home-title">Todays Objectives</p>
          </div>

          <div className="home-xp-border">
            <img src={xpBarBorder} className="home-xp-border-img" alt="" />
            {/* small screens: the same frame, stretched to fit, with an even outline */}
            <svg className="home-phone-xp-frame" viewBox="0 0 566 46" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M5.28418 44H539.362L560.284 1H16.1514L5.28418 44Z"
                fill="#322656" fillOpacity="0.35" stroke="#5B4A9A" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="home-xp-inner-wrap">
              <svg
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                viewBox="0 0 404 34"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <clipPath id="xp-clip">
                    <path d="M0 34H388.77L404 0H7.91055L0 34Z" />
                  </clipPath>
                  <filter id="inner-shadow">
                    <feOffset dy="4" />
                    <feGaussianBlur stdDeviation="2" />
                    <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                  </filter>
                </defs>
                <path d="M0 34H388.77L404 0H7.91055L0 34Z" fill="#4F4276" filter="url(#inner-shadow)" />
                <rect x="0" y="0" width={`${xpPercent * 404}`} height="34" fill="#916FF1" clipPath="url(#xp-clip)" />
                <path d="M0 34H388.77L404 0H7.91055L0 34Z" fill="none" stroke="#07070A" strokeWidth="0" strokeLinejoin="round" />
              </svg>
              <span className="home-xp-text">{xp}/100XP</span>
            </div>
            <span className="home-level-text">Level: {level}</span>
          </div>

          <div className="home-icon-btns">
            <button className="home-icon-btn" onClick={() => setShowSettings(true)}>
              <img src={settingsIcon} alt="settings" width="70" height="70" />
            </button>
            <button className="home-icon-btn" onClick={() => navigate('/goals')}>
              <img src={goalsIcon} alt="goals" width="70" height="70" />
            </button>
          </div>
        </div>

        <div className="home-clock">
          {formatClock(currentTime, user?.timezone || 'UTC')}
        </div>

        {emptyTier && !pathwayComplete && (
          <button className="home-tier-notice" type="button" onClick={() => navigate('/goals')}>
            Level {unlockedTier} tasks unlocked — add some in Goals
          </button>
        )}

        <div className="home-task-list">
          {endMessage ? (
            <p className="home-end-message">{endMessage}</p>
          ) : showPathwayEnd ? (
            <div className="home-tasks-done home-pathway-complete">
              <p className="home-pathway-title">PATHWAY COMPLETE</p>
              <p>You have mastered {goal?.name}, {user?.username}. Choose another pathway in Goals to keep climbing.</p>
            </div>
          ) : showTasksDone ? (
            <p className="home-tasks-done">No more tasks left, new tasks will be provided on reset for the next day</p>
          ) : dailyTasks.length === 0 ? (
            <p className="home-no-tasks">No tasks added yet — go to Goals and add some</p>
          ) : (
            dailyTasks.map((task, index) => (
              <div
                className={`home-task-row ${checked[index] ? 'checked' : ''} ${dissolvingIndices.includes(index) ? 'dissolving' : ''}`}
                key={task.id}
                onClick={() => handleCheck(index)}
              >
                {/* glass check box: fills purple and draws a tick when done */}
                <div className="home-task-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    {checked[index] && (
                      <path
                        className="task-tick-path"
                        d="M6 12.5 L10.5 17 L18.5 7.5"
                        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </div>

                <div className="home-task-info">
                  <span className="home-task-level">Level {task.level} Task</span>
                  <span className="home-task-title">{task.title}</span>
                </div>

                {index > 0 && !confirmed && !checked[index] && (
                  <button
                    type="button"
                    className={`home-task-refresh-wrap ${refreshedIndices.includes(index) ? 'used' : ''}`}
                    aria-label={settings.taskRefresh ? 'Reroll task, free' : `Reroll task, ${REFRESH_COST}XP`}
                    onClick={(e) => { e.stopPropagation(); handleRefresh(index) }}
                  >
                    <span className="refresh-badge">
                      {settings.taskRefresh ? 'FREE' : `${REFRESH_COST}XP`}
                    </span>
                    <svg
                      className={`home-task-refresh-icon ${spinningIndex === index ? 'spinning' : ''}`}
                      viewBox="0 0 57 57" fill="none" aria-hidden="true"
                    >
                      <path d="M46.6667 46.6702V35.2119H35.2083M10 10.0035V21.4619H21.4583M46.5246 26.0452C46.0449 22.2351 44.381 18.6718 41.7677 15.8579C39.1543 13.0441 35.7235 11.1218 31.9592 10.3622C28.1948 9.60269 24.287 10.0442 20.7871 11.6245C17.2871 13.2049 14.3717 15.8442 12.4521 19.1702M10.1421 30.6285C10.6218 34.4387 12.2857 38.002 14.899 40.8158C17.5123 43.6297 20.9432 45.552 24.7075 46.3115C28.4718 47.0711 32.3796 46.6295 35.8796 45.0492C39.3795 43.4689 42.295 40.8295 44.2146 37.5035"
                        stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}

                {settings.timerVisible && timeLeft !== null && (
                  // each character sits in a fixed-width slot so the box never
                  // shifts as the digits change
                  <div className="home-task-timer" role="timer" aria-label={formatTime(timeLeft)}>
                    {formatTime(timeLeft).split('').map((ch, i) => (
                      <span key={i} className={ch === ':' ? 'timer-colon' : 'timer-digit'} aria-hidden="true">{ch}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="home-action-area">
          {xpEarnedText ? (
            <span className="xp-earned-anim">{xpEarnedText}</span>
          ) : endMessage || showTasksDone || showPathwayEnd ? (
            null
          ) : !started ? (
            <button className="home-start-btn" onClick={handleStart}>
              <span>{settings.pauseProgression ? 'Paused' : 'Start Tasks'}</span>
            </button>
          ) : confirmed ? (
            null
          ) : (
            <button
              className={`home-start-btn ${!canConfirm ? 'locked' : ''}`}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              <span>
                {confirmUnlock > 0
                  ? `Confirm in ${formatTime(confirmUnlock)}`
                  : allTicked ? 'Confirm Tasks Done' : 'Tick all tasks to confirm'}
              </span>
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          settings={settings}
          onToggle={handleToggle}
        />
      )}
      {showPenalty && (
        <PenaltyModal
          onConfirm={handlePenaltySuccess}
          onPenalty={handlePenaltyFail}
          penaltyData={penaltyState}
          autoTriggered={autoLaunchPenalty}
        />
      )}
    </div>
  )
}

export default HomePage