import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
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
  failPenalty, confirmPenalty, autoFailPenalty, updateSettings
} from '../api'

const XP_PER_TASK = 15
const REFRESH_COST = 5

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// used for the level up notification — tells the user what their new window is
function getWindowLabel(level) {
  if (level <= 3) return '3 hours'
  if (level <= 6) return '2 hours'
  if (level <= 9) return '1.5 hours'
  return '1 hour'
}

// using Intl here because JS Date midnight calculation breaks across timezones
function getSecondsUntilMidnight(timezone) {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    })
    const parts = formatter.formatToParts(now)
    const get = type => parseInt(parts.find(p => p.type === type).value)
    const h = get('hour'), m = get('minute'), s = get('second')
    return (23 - h) * 3600 + (59 - m) * 60 + (60 - s)
  } catch {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return Math.floor((midnight - now) / 1000)
  }
}

function HomePage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [goal, setGoal] = useState(null)
  const [dailyTasks, setDailyTasks] = useState([])
  const [dailyState, setDailyState] = useState(null)
  const [penaltyState, setPenaltyState] = useState(null)
  const [windowSeconds, setWindowSeconds] = useState(10800)
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
  const [confirmUnlock, setConfirmUnlock] = useState(null)
  const [checked, setChecked] = useState([false, false, false])
  const [confirmed, setConfirmed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPenalty, setShowPenalty] = useState(false)
  const [spinningIndex, setSpinningIndex] = useState(null)

  const timerRef = useRef(null)
  const confirmRef = useRef(null)
  const clockRef = useRef(null)

  // tick the clock every second
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000)
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

  // shows a failure/outcome message for 10s then transitions to the end state
  function showEndState(message, username) {
    setEndMessage(message.replace('[username]', username || ''))
    setTimeout(() => {
      setEndMessage(null)
      setShowTasksDone(true)
    }, 10000)
  }

  useEffect(() => {
    async function load() {
      try {
        const [userData, dailyData] = await Promise.all([getUser(), getDaily()])
        if (!userData) { navigate('/setup'); return }

        setUser(userData)
        setSettings({
          timerVisible: !!userData.timer_visible,
          taskRefresh: !!userData.task_refresh,
          pauseProgression: !!userData.pause_progression
        })

        const { state, tasks, penalty, windowSeconds: ws } = dailyData
        setDailyTasks(tasks)
        setDailyState(state)
        setPenaltyState(penalty)
        setWindowSeconds(ws)

        const secondsUntilMidnight = getSecondsUntilMidnight(userData.timezone)

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

        const alreadyConfirmed = !!state?.confirmed
        setConfirmed(alreadyConfirmed)
        if (alreadyConfirmed) {
          setShowTasksDone(true)
          setLoading(false)
          return
        }

        // if a penalty was already active when the page reloaded, jump straight back into it
        if (penalty?.active) {
          setPenaltyTriggeredByTimer(true)
          setDissolvingIndices([0, 1, 2])
          setShowPenalty(true)
          setLoading(false)
          return
        }

        // check if there's enough time left in the day to actually complete the window
        // if not, automatically trigger the penalty system instead of letting them start
        if (!state?.started && !userData.pause_progression) {
          const penaltyDuration = 3600
          const confirmOffset = 600

          if (secondsUntilMidnight < ws) {
            if (secondsUntilMidnight >= penaltyDuration) {
              await triggerPenalty()
              const fresh = await getDaily()
              setPenaltyState(fresh.penalty)
              setPenaltyTriggeredByTimer(true)
              setAutoLaunchPenalty(true)
              setConfirmed(true)
              setDissolvingIndices([0, 1, 2])
              setShowPenalty(true)
              setLoading(false)
              return
            } else {
              // not even enough time for a penalty task — just deduct and move on
              const result = await autoFailPenalty()
              if (activeGoal) {
                setXp(result.xp)
                setXpAnim(result.xp)
                setLevel(result.level)
              }
              showEndState(`You did not have enough time to save yourself at all, [username]`, userData.username)
              setDissolvingIndices([0, 1, 2])
              setLoading(false)
              return
            }
          }
        }

        // normal flow — calculate remaining time from the stored window_start timestamp
        if (state?.started && state?.window_start) {
          const elapsed = Math.floor((Date.now() - new Date(state.window_start)) / 1000)
          const remaining = Math.max(0, ws - elapsed)
          setTimeLeft(remaining)
          const confirmUnlockAt = ws - 600
          const confirmRemaining = Math.max(0, confirmUnlockAt - elapsed)
          setConfirmUnlock(confirmRemaining)
        } else {
          setTimeLeft(ws)
          setConfirmUnlock(ws - 600)
        }

        setChecked(tasks.map(t => !!t.checked))
        // restore which refresh buttons should be hidden after a page reload
        setRefreshedIndices(tasks.map((t, i) => t.refreshed ? i : null).filter(i => i !== null))

      } catch (err) {
        console.error('Failed to load homepage:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate])

  // smooth XP bar animation — eases toward the target value
  useEffect(() => {
    const diff = xp - xpAnim
    if (Math.abs(diff) < 0.5) { setXpAnim(xp); return }
    const t = setTimeout(() => setXpAnim(p => p + diff * 0.1), 16)
    return () => clearTimeout(t)
  }, [xp, xpAnim])

  // main countdown — triggers penalty if timer hits zero without all tasks checked
  useEffect(() => {
    if (!dailyState?.started || confirmed || !timeLeft) return
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (!checked.every(Boolean)) handleTriggerPenalty()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [dailyState?.started, confirmed])

  // separate countdown for the confirm button unlock
  useEffect(() => {
    if (!dailyState?.started || confirmed || confirmUnlock === null) return
    if (confirmRef.current) clearInterval(confirmRef.current)
    if (confirmUnlock <= 0) return

    confirmRef.current = setInterval(() => {
      setConfirmUnlock(prev => {
        if (prev <= 1) { clearInterval(confirmRef.current); return 0 }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(confirmRef.current)
  }, [dailyState?.started, confirmed])

  async function handleStart() {
    if (settings.pauseProgression) return
    try {
      const result = await startDaily()
      setDailyState(prev => ({ ...prev, started: 1, window_start: result.window_start }))
    } catch (err) {
      console.error('Failed to start:', err)
    }
  }

  async function handleCheck(index) {
    if (!dailyState?.started || confirmed) return
    const task = dailyTasks[index]
    const newChecked = !checked[index]
    const updated = [...checked]
    updated[index] = newChecked
    setChecked(updated)
    await checkTask(task.id, newChecked)
  }

  async function handleConfirm() {
    if (confirmUnlock > 0 || confirmed || settings.pauseProgression) return
    try {
      const result = await confirmDaily()
      if (result.error) return

      const oldWindowLabel = getWindowLabel(level)
      const newWindowLabel = getWindowLabel(result.level)
      const checkedCount = checked.filter(Boolean).length

      setXp(result.xp)
      setLevel(result.level)
      setConfirmed(true)
      clearInterval(timerRef.current)
      clearInterval(confirmRef.current)

      // skip XP animation if penalty was involved — no reward messaging for that
      if (!penaltyTriggeredByTimer) {
        setXpEarnedText(`+${checkedCount * XP_PER_TASK}XP`)
        setTimeout(() => {
          setXpEarnedText(null)
          setShowTasksDone(true)
        }, 2500)
      } else {
        setShowTasksDone(true)
      }

      // stagger the card dissolve
      setDissolvingIndices([0])
      setTimeout(() => setDissolvingIndices([0, 1]), 200)
      setTimeout(() => setDissolvingIndices([0, 1, 2]), 400)

      // only show level up notification if the window tier actually changed
      if (result.level !== level && oldWindowLabel !== newWindowLabel) {
        setTimeout(() => {
          setLevelUpMsg(`SYSTEM UPDATE — Your daily window is now ${newWindowLabel}`)
          setTimeout(() => setLevelUpMsg(null), 5000)
        }, 3000)
      }

    } catch (err) {
      console.error('Failed to confirm:', err)
    }
  }

  async function handleTriggerPenalty() {
    try {
      await triggerPenalty()
      const fresh = await getDaily()
      setPenaltyState(fresh.penalty)
      setPenaltyTriggeredByTimer(true)
      setConfirmed(true)
      setDissolvingIndices([0])
      setTimeout(() => setDissolvingIndices([0, 1]), 150)
      setTimeout(() => setDissolvingIndices([0, 1, 2]), 300)
      setTimeout(() => setShowPenalty(true), 500)
    } catch (err) {
      console.error('Failed to trigger penalty:', err)
    }
  }

  async function handlePenaltyFail() {
    try {
      const result = await failPenalty()
      setXp(result.xp)
      setXpAnim(result.xp)
      setLevel(result.level)
      setShowPenalty(false)

      // different message depending on whether the penalty was auto-triggered or mid-session
      if (autoLaunchPenalty) {
        showEndState(
          `You ran out of time in the day to complete your tasks. We gave you a second chance but you still FAILED us, we shall take away what you worked hard for, [username]`,
          user?.username
        )
      } else {
        showEndState(
          `You failed to do the tasks and you failed on the penalty task, you aren't worthy of this XP.`,
          user?.username
        )
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

  const canConfirm = confirmUnlock === 0 && !confirmed
  const xpPercent = (xpAnim / 100) * 100
  const started = !!dailyState?.started

  if (loading) return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#07070A', color: '#916FF1',
      fontFamily: 'Alumni Sans, sans-serif', fontSize: '32px',
      fontStyle: 'italic', letterSpacing: '-1px'
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

      {levelUpMsg && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(76, 66, 106, 0.95)',
          border: '2px solid #916FF1', borderRadius: '37px',
          padding: '12px 32px',
          fontFamily: 'Alumni Sans, sans-serif', fontSize: '22px',
          fontStyle: 'italic', color: '#C1AAFF',
          zIndex: 50, backdropFilter: 'blur(12px)', letterSpacing: '-0.5px'
        }}>
          ⚡ {levelUpMsg}
        </div>
      )}

      <div className="home-content">
        <div className="home-header-bar">
          <div className="home-main-bar-bg" />
          <img src={mainBar} className="home-main-bar" alt="" />
          <img src={greetingsCard} className="home-greetings-card" alt="" />

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
                <rect x="0" y="3" width={`${xpPercent * 3.88}`} height="28" fill="#916FF1" clipPath="url(#xp-clip)" />
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

        <div className="home-task-list">
          {endMessage ? (
            <p className="home-end-message">{endMessage}</p>
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
                <div className="home-task-circle">
                  <svg width="95" height="95" viewBox="0 0 95 95" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M86.6945 35.5136C88.5213 44.4788 87.2194 53.7993 83.006 61.9208C78.7925 70.0423 71.9221 76.4738 63.5406 80.1429C55.1591 83.812 45.7731 84.4968 36.9478 82.0831C28.1225 79.6694 20.3914 74.3032 15.0437 66.8793C9.69607 59.4554 7.05512 50.4226 7.56129 41.2872C8.06746 32.1518 11.6901 23.466 17.8252 16.6783C23.9603 9.89064 32.2369 5.41135 41.2749 3.98744C50.3128 2.56353 59.5657 4.28107 67.4906 8.85363"
                      stroke="#916FF1" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                    />
                    {checked[index] && (
                      <path
                        className="task-tick-path"
                        d="M30 44 L44 60 L80 18"
                        stroke="#916FF1" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                        fill="none"
                      />
                    )}
                  </svg>
                </div>

                <div className="home-task-info">
                  <span className="home-task-level">Level {task.level} Task</span>
                  <span className="home-task-title">{task.title}</span>
                </div>

                {index > 0 && !confirmed && !checked[index] && (
                  <div
                    className={`home-task-refresh-wrap ${refreshedIndices.includes(index) ? 'used' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRefresh(index) }}
                  >
                    <div className="refresh-badge">
                      {settings.taskRefresh ? 'FREE' : `${REFRESH_COST}XP`}
                    </div>
                    <svg
                      className={`home-task-refresh-icon ${spinningIndex === index ? 'spinning' : ''}`}
                      width="57" height="57" viewBox="0 0 57 57" fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M46.6667 46.6702V35.2119H35.2083M10 10.0035V21.4619H21.4583M46.5246 26.0452C46.0449 22.2351 44.381 18.6718 41.7677 15.8579C39.1543 13.0441 35.7235 11.1218 31.9592 10.3622C28.1948 9.60269 24.287 10.0442 20.7871 11.6245C17.2871 13.2049 14.3717 15.8442 12.4521 19.1702M10.1421 30.6285C10.6218 34.4387 12.2857 38.002 14.899 40.8158C17.5123 43.6297 20.9432 45.552 24.7075 46.3115C28.4718 47.0711 32.3796 46.6295 35.8796 45.0492C39.3795 43.4689 42.295 40.8295 44.2146 37.5035"
                        stroke="#916FF1" strokeWidth="4.58333" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}

                {settings.timerVisible && timeLeft !== null && (
                  <div className="home-task-timer">{formatTime(timeLeft)}</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="home-action-area">
          {xpEarnedText ? (
            <span className="xp-earned-anim">{xpEarnedText}</span>
          ) : endMessage || showTasksDone ? (
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
              <span>{canConfirm ? 'Confirm Tasks Done' : `Confirm in ${formatTime(confirmUnlock)}`}</span>
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
          onClose={() => setShowPenalty(false)}
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