import { useState } from 'react'
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

  // required levels that still need tasks, e.g. [2, 3]
  const missingLevels = REQUIRED_LEVELS.filter(l => filledCount(tasks[l]) < MIN_TASKS)
  const canConfirm = goalName.trim() !== '' && missingLevels.length === 0

  // shown under the level tabs so it's clear which levels are required
  function renderLevelNote(level, levelTasks) {
    if (!REQUIRED_LEVELS.includes(level)) {
      return <p className="setup-level-note optional">Optional — you can fill this level in later from Goals</p>
    }
    const count = filledCount(levelTasks)
    return (
      <p className={`setup-level-note ${count >= MIN_TASKS ? 'done' : 'required'}`}>
        {count >= MIN_TASKS ? '✓' : '•'} {Math.min(count, MIN_TASKS)}/{MIN_TASKS} tasks — required
      </p>
    )
  }

  function startHint() {
    if (!goalName.trim()) return 'Name your goal pathway to continue'
    if (missingLevels.length > 0) {
      // "Level 3" / "Levels 2 and 3" / "Levels 1, 2 and 3"
      const list = missingLevels.length === 1
        ? `Level ${missingLevels[0]}`
        : `Levels ${missingLevels.slice(0, -1).join(', ')} and ${missingLevels.at(-1)}`
      return `Add at least ${MIN_TASKS} tasks to ${list} to continue`
    }
    return null
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

  const hint = startHint()

  return (
    <div className="setup-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      <div className="setup-content">
        <img src={logo} className="setup-logo" alt="Rhabit" />

        <p className="setup-greeting">GREETINGS, {user?.username?.toUpperCase()}</p>
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
        <p className="setup-requirement">
          Levels 1–3 need at least {MIN_TASKS} tasks each. Levels 4–10 are optional — new task
          levels unlock as you level up, and you can add them any time from Goals.
        </p>

        <div className="setup-task-panel">
          <LevelTaskEditor
            tasksByLevel={tasks}
            onChange={(level, list) => setTasks(prev => ({ ...prev, [level]: list }))}
            padEmptyRows
            placeholder="Task Empty - Edit to add content"
            iconSize={60}
            renderLevelNote={renderLevelNote}
          />
        </div>

        <p className="setup-warning">
          WARNING: THE SYSTEM <strong>DOESN'T TOLERATE FAILURE</strong>. YOU <strong>MUST COMPLETE ALL</strong> DAILY OBJECTIVES
          <br />IF YOU <strong>FAIL</strong> YOU MUST FACE THE <strong>CONSEQUENCES</strong> OF <strong>YOUR</strong> ACTIONS
        </p>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {!error && hint && <p className="setup-start-hint">{hint}</p>}

        <button
          className="start-btn"
          onClick={handleConfirm}
          disabled={!canConfirm || submitting}
        >
          <span>{submitting ? 'Saving...' : 'Start'}</span>
        </button>

        <button className="auth-link auth-link-btn" type="button" onClick={logout}>
          Not you? Log out
        </button>
      </div>
    </div>
  )
}

export default SetupPage
