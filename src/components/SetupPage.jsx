import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/icons/Rhabit Logo.svg'
import leftArrow from '../assets/icons/leftarrow.svg'
import rightArrow from '../assets/icons/rightarrow.svg'
import editIcon from '../assets/icons/EditButton.svg'
import trashIcon from '../assets/icons/TrashButton.svg'
import cornerFrame from '../assets/images/cornerframe.svg'
import { createUser, createGoal, saveGoalTasks, starGoal } from '../api'

function getWindowLabel(level) {
  if (level <= 3) return '3hr'
  if (level <= 6) return '2hr'
  if (level <= 9) return '1.5hr'
  return '1hr'
}

function getWindowDescription(level) {
  if (level <= 3) return 'Level 1-3 tasks must be completed within a 3 hour daily window'
  if (level <= 6) return 'Level 4-6 tasks must be completed within a 2 hour daily window'
  if (level <= 9) return 'Level 7-9 tasks must be completed within a 1.5 hour daily window'
  return 'Level 10 tasks must be completed within a 1 hour daily window'
}

function SetupPage() {
  const [username, setUsername] = useState('')
  const [goalName, setGoalName] = useState('')
  const [activeLevel, setActiveLevel] = useState(1)
  const [tabPage, setTabPage] = useState(0)
  const [currentTaskPage, setCurrentTaskPage] = useState(0)
  const [editingIndex, setEditingIndex] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const [tasks, setTasks] = useState({
    1: [], 2: [], 3: [], 4: [], 5: [],
    6: [], 7: [], 8: [], 9: [], 10: []
  })

  const TASKS_PER_PAGE = 3
  const levels = tabPage === 0 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10]

  const levelTasks = tasks[activeLevel]
  const totalPages = Math.max(1, Math.ceil(levelTasks.length / TASKS_PER_PAGE))
  const startIndex = currentTaskPage * TASKS_PER_PAGE
  const visibleTasks = levelTasks.slice(startIndex, startIndex + TASKS_PER_PAGE)

  // pad to always show 3 rows even if fewer tasks exist
  const paddedTasks = [
    ...visibleTasks,
    ...Array(Math.max(0, TASKS_PER_PAGE - visibleTasks.length)).fill(null)
  ]

  // start button stays disabled until username, goal name and 3+ tasks per level are filled
  function canConfirm() {
    if (!username.trim() || !goalName.trim()) return false
    for (let l = 1; l <= 10; l++) {
      const filled = tasks[l].filter(t => t.title.trim() !== '').length
      if (filled < 3) return false
    }
    return true
  }

  function addTask() {
    const currentLevelTasks = tasks[activeLevel]
    if (currentLevelTasks.length >= 6) return
    const newTasks = [...currentLevelTasks, { title: '' }]
    setTasks(prev => ({ ...prev, [activeLevel]: newTasks }))
    setCurrentTaskPage(Math.floor((newTasks.length - 1) / TASKS_PER_PAGE))
    setEditingIndex((newTasks.length - 1) % TASKS_PER_PAGE)
  }

  function deleteTask(index) {
    const realIndex = startIndex + index
    const updated = levelTasks.filter((_, i) => i !== realIndex)
    setTasks(prev => ({ ...prev, [activeLevel]: updated }))
    setEditingIndex(null)
    if (currentTaskPage > 0 && startIndex >= updated.length) {
      setCurrentTaskPage(currentTaskPage - 1)
    }
  }

  function updateTask(index, value) {
    const realIndex = startIndex + index
    const updated = [...levelTasks]
    updated[realIndex] = { ...updated[realIndex], title: value }
    setTasks(prev => ({ ...prev, [activeLevel]: updated }))
  }

  function handleLevelChange(level) {
    setActiveLevel(level)
    setCurrentTaskPage(0)
    setEditingIndex(null)
  }

  async function handleConfirm() {
    if (!canConfirm() || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      // grab timezone from the browser so daily resets happen at the right time
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      await createUser(username.trim(), timezone)

      const goalResult = await createGoal(goalName.trim())
      const goalId = goalResult.id

      for (let l = 1; l <= 10; l++) {
        const levelTaskList = tasks[l].filter(t => t.title.trim() !== '')
        if (levelTaskList.length > 0) {
          await saveGoalTasks(goalId, l, levelTaskList)
        }
      }

      await starGoal(goalId)
      navigate('/home')

    } catch (err) {
      console.error('Setup failed:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="setup-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      <div className="setup-content">
        <img src={logo} className="setup-logo" alt="Rhabit" />

        <p className="setup-greeting">GREETINGS,</p>
        <p className="setup-greeting">THE SYSTEM WILL BOOT ITSELF UP ONCE YOU UPLOAD YOUR INFORMATION BELOW</p>

        <div className="setup-inputs-row">
          <div className="setup-field">
            <label className="setup-label">YOUR USERNAME</label>
            <input
              className="setup-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="setup-field">
            <label className="setup-label">NAME OF GOAL PATHWAY</label>
            <input
              className="setup-input"
              type="text"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
              maxLength={28}
            />
          </div>
        </div>

        <p className="setup-priority-label">
          LIST YOUR TASKS FROM LOWEST TO HIGHEST PRIORITY (1-10)
        </p>

        <div className="setup-task-panel">
          <div className="tabs-carousel">
            <button
              className="carousel-arrow"
              onClick={() => { setTabPage(0); handleLevelChange(1) }}
              disabled={tabPage === 0}
            >
              <img src={leftArrow} alt="prev" />
            </button>
            <div className="level-tabs">
              {levels.map(level => (
                <button
                  key={level}
                  className={`level-tab${activeLevel === level ? ' active' : ''}`}
                  onClick={() => handleLevelChange(level)}
                >
                  Level {level} Tasks
                </button>
              ))}
            </div>
            <button
              className="carousel-arrow"
              onClick={() => { setTabPage(1); handleLevelChange(6) }}
              disabled={tabPage === 1}
            >
              <img src={rightArrow} alt="next" />
            </button>
          </div>

          <p className="window-info-label">⏱ {getWindowDescription(activeLevel)}</p>

          <div className="task-fixed-area">
            {paddedTasks.map((task, index) => (
              <div
                className={`task-row ${task === null ? 'task-row-empty' : ''}`}
                key={index}
              >
                {task !== null ? (
                  <>
                    <div className="task-text">
                      <span className="task-level-label">
                        Level {activeLevel} Task — {getWindowLabel(activeLevel)} timer
                      </span>
                      <input
                        className="task-edit-input"
                        type="text"
                        value={task.title}
                        placeholder="Click to Edit"
                        readOnly={editingIndex !== index}
                        onChange={e => updateTask(index, e.target.value)}
                        maxLength={40}
                      />
                    </div>
                    <div className="task-actions">
                      <button
                        className={`task-icon-btn ${editingIndex === index ? 'editing' : ''}`}
                        onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                      >
                        <img src={editIcon} alt="edit" width="60" height="60" />
                      </button>
                      <button
                        className="task-icon-btn"
                        onClick={() => deleteTask(index)}
                      >
                        <img src={trashIcon} alt="delete" width="60" height="60" />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          <div className="task-add-row">
            <div className="task-pagination">
              <button
                className={`page-dot ${currentTaskPage === 0 ? 'active' : 'inactive'}`}
                onClick={() => { setCurrentTaskPage(p => Math.max(0, p - 1)); setEditingIndex(null) }}
              />
              <button
                className={`page-dot ${currentTaskPage > 0 ? 'active' : 'inactive'}`}
                onClick={() => { setCurrentTaskPage(p => Math.min(totalPages - 1, p + 1)); setEditingIndex(null) }}
              />
            </div>
            <button
              className="add-task-btn"
              onClick={addTask}
              disabled={tasks[activeLevel].length >= 6}
            >
              Add Task
            </button>
          </div>
        </div>

        <p className="setup-warning">
          WARNING SYSTEM <strong>DOESNT TOLERATE, INTOLERANCE</strong>. YOU <strong>MUST COMPLETE ALL</strong> DAILY OBJECTIVES
          <br />IF YOU <strong>FAIL</strong> YOU MUST FACE THE <strong>CONSEQUENCES</strong> OF <strong>YOUR</strong> ACTIONS
        </p>

        {error && <p style={{ color: '#ff6b6b', fontFamily: 'Alumni Sans', fontSize: '20px' }}>{error}</p>}

        <button
          className="start-btn"
          onClick={handleConfirm}
          disabled={!canConfirm() || submitting}
        >
          <span>{submitting ? 'Saving...' : 'Start'}</span>
        </button>
      </div>
    </div>
  )
}

export default SetupPage