import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/icons/Rhabit Logo.svg'
import cornerFrame from '../assets/images/cornerframe.svg'
import LevelTaskEditor from './LevelTaskEditor'
import { completeSetup } from '../api'
import { useAuth } from '../auth/AuthContext'

// Levels 1–3 must be filled in before starting so the first few level-ups
// always have tasks; 4–10 can be added later from Goals. The server enforces
// the same rule (server/routes/setup.js).
const REQUIRED_LEVELS = [1, 2, 3]
const MIN_TASKS = 3

const emptyLevels = () => ({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] })
const filledCount = list => list.filter(t => t.title.trim() !== '').length

function SetupPage() {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const [goalName, setGoalName] = useState('')
  const [tasks, setTasks] = useState(emptyLevels)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const contentRef = useRef(null)

  // Fit the whole page in the window, never scrolling: the CSS breakpoints cover
  // common screen sizes, and if the content is still taller than the window it's
  // scaled down just enough to fit.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const PAGE_PADDING = 40 // .setup-page has 20px top and bottom
    const fit = () => {
      const available = window.innerHeight - PAGE_PADDING
      const scale = Math.min(1, available / el.offsetHeight)
      el.style.transform = scale < 1 ? `scale(${scale})` : ''
    }
    fit()
    // re-fit when the window resizes or the content changes height (e.g. an error)
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    window.addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [])

  // required levels that still need tasks, e.g. [2, 3]
  const missingLevels = REQUIRED_LEVELS.filter(l => filledCount(tasks[l]) < MIN_TASKS)
  const canConfirm = goalName.trim() !== '' && missingLevels.length === 0

  // small progress badge on the Level 1–3 tabs: "1/3" until filled, then "✓"
  function renderTabBadge(level, levelTasks) {
    if (!REQUIRED_LEVELS.includes(level)) return null
    const count = filledCount(levelTasks)
    const done = count >= MIN_TASKS
    return (
      <span className={`level-tab-badge ${done ? 'done' : ''}`} aria-label={done ? 'complete' : `${count} of ${MIN_TASKS} tasks`}>
        {done ? '✓' : `${count}/${MIN_TASKS}`}
      </span>
    )
  }

  // one line of guidance near the top, worded as progress towards unlocking Start
  function statusLine() {
    if (missingLevels.length > 0) {
      return {
        ready: false,
        text: `Fill Levels 1–3 with ${MIN_TASKS} tasks each to unlock Start · Levels 4–10 are optional and can be added later from Goals`
      }
    }
    if (!goalName.trim()) {
      return { ready: false, text: '✓ Levels 1–3 ready — name your goal pathway to unlock Start' }
    }
    return { ready: true, text: '✓ Ready to start · Levels 4–10 are optional and can be added later from Goals' }
  }

  async function handleConfirm() {
    if (!canConfirm || submitting) return
    setSubmitting(true)
    setError(null)

    // one request: the server creates everything in a single transaction
    const levels = Object.entries(tasks)
      .map(([level, list]) => ({
        level: Number(level),
        titles: list.map(t => t.title.trim()).filter(Boolean)
      }))
      .filter(l => l.titles.length > 0)

    const result = await completeSetup(goalName.trim(), levels)
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    // refresh the session so the route guard knows setup is finished
    await refresh()
    navigate('/home', { replace: true })
  }

  const status = statusLine()

  return (
    <div className="setup-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      {/* top-right, where Home keeps its settings/goals buttons, so the centre
          column stays symmetrical */}
      <button className="settings-account-btn setup-logout" type="button" onClick={logout}>
        Log out
      </button>

      <div className="setup-content" ref={contentRef}>
        <img src={logo} className="setup-logo" alt="Rhabit" />

        <p className="setup-greeting setup-greeting-name">GREETINGS, {user?.username?.toUpperCase()}</p>
        <p className="setup-greeting">THE SYSTEM WILL BOOT ITSELF UP ONCE YOU UPLOAD YOUR INFORMATION BELOW</p>

        <div className="setup-inputs-row">
          <div className="setup-field">
            <label className="setup-label" htmlFor="setup-goal-name">NAME OF GOAL PATHWAY</label>
            <input
              id="setup-goal-name"
              className="setup-input"
              type="text"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
              maxLength={28}
              style={{ textAlign: goalName.length > 15 ? 'left' : 'center' }}
            />
          </div>
        </div>

        <p className="setup-priority-label">
          LIST YOUR TASKS FROM LOWEST TO HIGHEST PRIORITY (1-10)
        </p>

        <div className="setup-task-panel">
          <LevelTaskEditor
            tasksByLevel={tasks}
            onChange={(level, list) => setTasks(prev => ({ ...prev, [level]: list }))}
            padEmptyRows
            placeholder="Task Empty - Edit to add content"
            iconSize={60}
            renderTabBadge={renderTabBadge}
            infoExtra={
              <span className={`level-info-line status ${status.ready ? 'ready' : ''}`} role="status">
                {status.text}
              </span>
            }
          />
        </div>

        <p className="setup-warning">
          WARNING: THE SYSTEM <strong>DOESN'T TOLERATE FAILURE</strong>. YOU <strong>MUST COMPLETE ALL</strong> DAILY OBJECTIVES
          <br />IF YOU <strong>FAIL</strong> YOU MUST FACE THE <strong>CONSEQUENCES</strong> OF <strong>YOUR</strong> ACTIONS
        </p>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="setup-actions">
          <button
            className="start-btn"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            title={canConfirm ? undefined : status.text}
          >
            <span>{submitting ? 'Saving...' : 'Start'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SetupPage
