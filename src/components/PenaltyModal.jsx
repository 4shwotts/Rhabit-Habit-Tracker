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

function PenaltyModal({ onConfirm, onPenalty, penaltyData, autoTriggered }) {
  // a clock ticking once a second; both countdowns are worked out from it and
  // the stored start time, so they survive page refreshes
  const [now, setNow] = useState(() => Date.now())
  // the player ticks the penalty task off before they can confirm it
  const [ticked, setTicked] = useState(false)
  // onPenalty is called once, when the task timer reaches zero
  const expired = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = penaltyData ? Math.floor((now - new Date(penaltyData.started_at)) / 1000) : 0
  const taskTimer = penaltyData ? Math.max(0, penaltyData.task_timer_seconds - elapsed) : 0
  // unlock time comes from the server, which also enforces it
  const unlockAt = penaltyData ? penaltyData.task_timer_seconds - (penaltyData.unlock_before_end ?? 60) : 0
  const unlockTimer = Math.max(0, unlockAt - elapsed)
  const canConfirm = !!penaltyData && unlockTimer === 0

  useEffect(() => {
    if (!penaltyData?.active || taskTimer > 0 || expired.current) return
    expired.current = true
    onPenalty()
  }, [penaltyData, taskTimer, onPenalty])

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