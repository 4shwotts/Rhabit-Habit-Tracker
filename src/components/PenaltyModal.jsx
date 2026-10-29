import { useState, useEffect, useRef } from 'react'
import { confirmPenalty } from '../api'
import ModalFrame from './ModalFrame'

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function PenaltyModal({ onClose, onConfirm, onPenalty, penaltyData, autoTriggered }) {
  const [taskTimer, setTaskTimer] = useState(0)
  const [unlockTimer, setUnlockTimer] = useState(0)
  const [canConfirm, setCanConfirm] = useState(false)
  // the player ticks the penalty task off before they can confirm it
  const [ticked, setTicked] = useState(false)
  const taskRef = useRef(null)
  const unlockRef = useRef(null)

  useEffect(() => {
    if (!penaltyData) return

    // calculate remaining time from the stored timestamp so it survives page refreshes
    const startedAt = new Date(penaltyData.started_at)
    const now = new Date()
    const elapsed = Math.floor((now - startedAt) / 1000)
    const taskRemaining = Math.max(0, penaltyData.task_timer_seconds - elapsed)

    // unlock time comes from the server, which also enforces it
    const unlockThreshold = penaltyData.task_timer_seconds - (penaltyData.unlock_before_end ?? 60)
    const unlockRemaining = Math.max(0, unlockThreshold - elapsed)

    setTaskTimer(taskRemaining)
    setUnlockTimer(unlockRemaining)
    if (unlockRemaining === 0) setCanConfirm(true)

    taskRef.current = setInterval(() => {
      setTaskTimer(prev => {
        if (prev <= 1) {
          clearInterval(taskRef.current)
          clearInterval(unlockRef.current)
          onPenalty()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    if (unlockRemaining > 0) {
      unlockRef.current = setInterval(() => {
        setUnlockTimer(prev => {
          if (prev <= 1) {
            clearInterval(unlockRef.current)
            setCanConfirm(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      clearInterval(taskRef.current)
      clearInterval(unlockRef.current)
    }
  }, [penaltyData])

  const ready = canConfirm && ticked

  async function handleConfirm() {
    if (!ready) return
    try {
      await confirmPenalty()
      onConfirm()
    } catch (err) {
      console.error('Failed to confirm penalty:', err)
    }
  }

  if (!penaltyData) return null

  return (
    <div className="modal-overlay">
      <div className="penalty-box">
        <ModalFrame className="penalty-frame" />

        <div className="penalty-content">
          <p className="penalty-title">
            {autoTriggered
              ? 'YOU DID NOT HAVE ENOUGH TIME TO FINISH YOUR TASKS FOR THE DAY'
              : <>YOU HAVE <strong>FAILED</strong> TO COMPLETE ALL YOUR TASKS</>
            }
          </p>
          <p className="penalty-sub">you have disappointed US</p>
          <p className="penalty-sub">we will offer you one last chance</p>

          <button
            type="button"
            className={`penalty-task-row ${ticked ? 'checked' : ''}`}
            onClick={() => setTicked(t => !t)}
            aria-pressed={ticked}
          >
            {/* same glass check box as the Home task cards */}
            <span className="home-task-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                {ticked && (
                  <path
                    className="task-tick-path"
                    d="M6 12.5 L10.5 17 L18.5 7.5"
                    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                  />
                )}
              </svg>
            </span>
            <span className="penalty-task-info">
              <span className="penalty-task-level">
                {penaltyData.task_difficulty === 'hard' ? 'Hard penalty' : 'Easy penalty'}
              </span>
              <span className="penalty-task-title">{penaltyData.task_title}</span>
            </span>
            {/* fixed-width character slots so the box never shifts */}
            <span className="home-task-timer penalty-timer" role="timer" aria-label={formatTime(taskTimer)}>
              {formatTime(taskTimer).split('').map((ch, i) => (
                <span key={i} className={ch === ':' ? 'timer-colon' : 'timer-digit'} aria-hidden="true">{ch}</span>
              ))}
            </span>
          </button>

          <p className="penalty-warning">
            COMPLETE THIS WITHIN THE TIME ALLOCATED OR LOSE A DAYS WORTH OF XP
          </p>

          <button
            className="penalty-confirm-btn"
            onClick={handleConfirm}
            disabled={!ready}
          >
            <span aria-live="polite">
              {!canConfirm
                ? `Confirm in ${formatTime(unlockTimer)}`
                : ticked ? 'Confirm Completion' : 'Tick the task to confirm'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default PenaltyModal