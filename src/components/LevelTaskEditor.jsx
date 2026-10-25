import { useState } from 'react'
import editIcon from '../assets/icons/EditGlyph.svg'
import trashIcon from '../assets/icons/TrashGlyph.svg'

// Shared editor for a goal's per-level task lists, used by the setup page and
// the expanded goal modal on the Goals page: level tabs (1–5 / 6–10), three
// tasks per page, edit/delete buttons and "Add Task".
//
// The parent owns the data. `tasksByLevel` is { 1: [{ title }], …, 10: [...] }.
//   onChange(level, tasks) — called on every edit, add and delete
//   onCommit(level, tasks) — optional; called when an edit is finished (blur)
//                            and after a delete, so the Goals page can save

// Split-tail arrowhead for the level carousel: a slim tail wedge and a sharp
// head with a notch between them. `left` mirrors it.
function NavArrow({ left = false }) {
  return (
    <svg
      className="nav-arrow" viewBox="0 0 48 32" width="44" height="30" aria-hidden="true"
      style={left ? { transform: 'scaleX(-1)' } : undefined}
    >
      <polygon points="2,16 23,10.5 19,16 23,21.5" fill="currentColor" />
      <polygon points="21,2 46,16 21,30 27.5,16" fill="currentColor" />
    </svg>
  )
}

const TASKS_PER_PAGE = 3
const MAX_TASKS_PER_LEVEL = 6

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

function LevelTaskEditor({
  tasksByLevel,
  onChange,
  onCommit,
  // setup page pads each page to three rows with empty "+" placeholders;
  // the Goals modal shows an empty-state message instead
  padEmptyRows = false,
  listClassName = 'task-fixed-area',
  emptyMessage = 'No tasks yet — click Add Task',
  placeholder = 'Click to Edit',
  // optional small badge inside a level tab, e.g. setup's "✓" / "1/3" progress
  renderTabBadge,
  // optional second line in the info tab under the level pill (setup's progress)
  infoExtra
}) {
  const [tabPage, setTabPage] = useState(0)
  const [activeLevel, setActiveLevel] = useState(1)
  const [taskPage, setTaskPage] = useState(0)
  // index into the whole level list (not just the visible page)
  const [editingIndex, setEditingIndex] = useState(null)

  const levels = tabPage === 0 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10]
  const levelTasks = tasksByLevel[activeLevel] || []
  const totalPages = Math.max(1, Math.ceil(levelTasks.length / TASKS_PER_PAGE))
  const startIndex = taskPage * TASKS_PER_PAGE
  const visibleTasks = levelTasks.slice(startIndex, startIndex + TASKS_PER_PAGE)
  const rows = padEmptyRows
    ? [...visibleTasks, ...Array(Math.max(0, TASKS_PER_PAGE - visibleTasks.length)).fill(null)]
    : visibleTasks

  function changeLevel(level) {
    setActiveLevel(level)
    setTaskPage(0)
    setEditingIndex(null)
  }

  function updateTask(index, value) {
    const updated = levelTasks.map((t, i) => (i === index ? { ...t, title: value } : t))
    onChange(activeLevel, updated)
  }

  function deleteTask(index) {
    const updated = levelTasks.filter((_, i) => i !== index)
    onChange(activeLevel, updated)
    onCommit?.(activeLevel, updated)
    setEditingIndex(null)
    // step back a page if this one is now empty
    const pages = Math.max(1, Math.ceil(updated.length / TASKS_PER_PAGE))
    if (taskPage >= pages) setTaskPage(pages - 1)
  }

  function addTask() {
    if (levelTasks.length >= MAX_TASKS_PER_LEVEL) return
    const updated = [...levelTasks, { title: '' }]
    onChange(activeLevel, updated)
    setTaskPage(Math.floor((updated.length - 1) / TASKS_PER_PAGE))
    setEditingIndex(updated.length - 1)
  }

  return (
    <>
      {/* level pill with an info tab tucked underneath it */}
      <div className="level-nav">
      <div className="tabs-carousel">
        <button
          className="carousel-arrow"
          aria-label="Previous levels"
          onClick={() => { setTabPage(0); changeLevel(1) }}
          disabled={tabPage === 0}
        >
          <NavArrow left />
        </button>
        <div className="level-tabs">
          {levels.map(level => (
            <button
              key={level}
              className={`level-tab${activeLevel === level ? ' active' : ''}`}
              onClick={() => changeLevel(level)}
            >
              Level {level} Tasks
              {renderTabBadge?.(level, tasksByLevel[level] || [])}
            </button>
          ))}
        </div>
        <button
          className="carousel-arrow"
          aria-label="Next levels"
          onClick={() => { setTabPage(1); changeLevel(6) }}
          disabled={tabPage === 1}
        >
          <NavArrow />
        </button>
      </div>

      <div className="level-info-tab">
        {/* decorative layer: the warped glass fill */}
        <span className="level-info-fill" aria-hidden="true" />
        <div className="level-info-inner">
          <span className="level-info-line">⏱ {getWindowDescription(activeLevel)}</span>
          {infoExtra}
        </div>
      </div>
      </div>

      <div className={listClassName}>
        {!padEmptyRows && rows.length === 0 ? (
          <p className="expanded-no-tasks">{emptyMessage}</p>
        ) : (
          rows.map((task, i) => {
            const index = startIndex + i
            if (task === null) return <div className="task-row task-row-empty" key={`empty-${i}`} />
            return (
              <div className="task-row" key={index}>
                <div className="task-text">
                  <span className="task-level-label">
                    Level {activeLevel} Task — {getWindowLabel(activeLevel)} timer
                  </span>
                  <input
                    className="task-edit-input"
                    type="text"
                    value={task.title}
                    placeholder={placeholder}
                    readOnly={editingIndex !== index}
                    onChange={e => updateTask(index, e.target.value)}
                    onBlur={() => onCommit?.(activeLevel, levelTasks)}
                    maxLength={40}
                  />
                </div>
                <div className="task-actions">
                  <button
                    className={`task-icon-btn ${editingIndex === index ? 'editing' : ''}`}
                    aria-label={editingIndex === index ? 'Finish editing task' : 'Edit task'}
                    aria-pressed={editingIndex === index}
                    onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                  >
                    <img src={editIcon} alt="" className="task-icon-img" />
                  </button>
                  <button className="task-icon-btn" aria-label="Delete task" onClick={() => deleteTask(index)}>
                    <img src={trashIcon} alt="" className="task-icon-img" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="task-add-row">
        <div className="task-pagination">
          <button
            className={`page-dot ${taskPage === 0 ? 'active' : 'inactive'}`}
            onClick={() => { setTaskPage(p => Math.max(0, p - 1)); setEditingIndex(null) }}
          />
          <button
            className={`page-dot ${taskPage > 0 ? 'active' : 'inactive'}`}
            onClick={() => { setTaskPage(p => Math.min(totalPages - 1, p + 1)); setEditingIndex(null) }}
          />
        </div>
        <button
          className="add-task-btn"
          onClick={addTask}
          disabled={levelTasks.length >= MAX_TASKS_PER_LEVEL}
        >
          <span className="btn-label">Add Task</span>
        </button>
      </div>
    </>
  )
}

export default LevelTaskEditor
