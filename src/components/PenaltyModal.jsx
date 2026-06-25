import { useState, useEffect, useRef } from 'react'
import { confirmPenalty } from '../api'

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
  const taskRef = useRef(null)
  const unlockRef = useRef(null)

  useEffect(() => {
    if (!penaltyData) return

    // calculate remaining time from the stored timestamp so it survives page refreshes
    const startedAt = new Date(penaltyData.started_at)
    const now = new Date()
    const elapsed = Math.floor((now - startedAt) / 1000)
    const taskRemaining = Math.max(0, penaltyData.task_timer_seconds - elapsed)

    // unlock threshold is hardcoded to 5s here but the server enforces it too
    const unlockThreshold = penaltyData.task_timer_seconds - 5
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

  async function handleConfirm() {
    if (!canConfirm) return
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
        <svg className="penalty-frame" viewBox="0 0 1100 696" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="14.3869" y="15.3022" width="1070.09" height="661.091" rx="32.0457" fill="#382A60" fillOpacity="0.2" stroke="#916FF1" strokeWidth="3.90864"/>
          <path d="M32.6047 8.00768C29.6231 8.0098 26.8897 9.67117 25.5134 12.3179L7.96124 46.0715C4.22638 53.2538 12.2915 60.8055 19.2076 56.6019L74.7854 22.8212C81.7015 18.6175 78.7218 7.97484 70.6304 7.9806L32.6047 8.00768Z" fill="#382A60" fillOpacity="0.2"/>
          <path d="M32.604 6.50708C29.0634 6.5096 25.8174 8.48258 24.183 11.6254L6.63093 45.3795C2.19595 53.9084 11.7735 62.8756 19.9862 57.8838L75.5636 24.1034C83.7763 19.1117 80.2383 6.47367 70.6301 6.48021L32.604 6.50708Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M1066.56 8.00768C1069.54 8.0098 1072.27 9.67117 1073.65 12.3179L1091.2 46.0715C1094.94 53.2538 1086.87 60.8055 1079.96 56.6019L1024.38 22.8212C1017.46 18.6175 1020.44 7.97484 1028.53 7.9806L1066.56 8.00768Z" fill="#382A60" fillOpacity="0.2"/>
          <path d="M1066.56 6.50708C1070.1 6.5096 1073.35 8.48258 1074.98 11.6254L1092.53 45.3795C1096.97 53.9084 1087.39 62.8756 1079.18 57.8838L1023.6 24.1034C1015.39 19.1117 1018.93 6.47367 1028.53 6.48021L1066.56 6.50708Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M1066.56 684.282C1069.54 684.28 1072.27 682.618 1073.65 679.972L1091.2 646.218C1094.94 639.036 1086.87 631.484 1079.96 635.688L1024.38 669.468C1017.46 673.672 1020.44 684.315 1028.53 684.309L1066.56 684.282Z" fill="#382A60" fillOpacity="0.2"/>
          <path d="M1066.56 685.782C1070.1 685.78 1073.35 683.807 1074.98 680.664L1092.53 646.91C1096.97 638.381 1087.39 629.414 1079.18 634.406L1023.6 668.186C1015.39 673.178 1018.93 685.816 1028.53 685.809L1066.56 685.782Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M32.6047 684.282C29.6231 684.28 26.8897 682.618 25.5134 679.972L7.96124 646.218C4.22638 639.036 12.2915 631.484 19.2076 635.688L74.7854 669.468C81.7015 673.672 78.7218 684.315 70.6304 684.309L32.6047 684.282Z" fill="#382A60" fillOpacity="0.2"/>
          <path d="M32.604 685.782C29.0634 685.78 25.8174 683.807 24.183 680.664L6.63093 646.91C2.19595 638.381 11.7735 629.414 19.9862 634.406L75.5636 668.186C83.7763 673.178 80.2383 685.816 70.6301 685.809L32.604 685.782Z" stroke="#916FF1" strokeWidth="3"/>
          <path d="M553.32 56.0349C550.674 57.7379 547.275 57.7311 544.635 56.0176L485.601 17.7103C478.91 13.3685 481.99 2.98423 489.965 3.00012L608.142 3.23567C616.116 3.25156 619.166 13.648 612.463 17.9632L553.32 56.0349Z" fill="#382A60" fillOpacity="0.2"/>
          <path d="M554.132 57.2963C550.991 59.3185 546.954 59.3104 543.819 57.2757L484.785 18.9685C476.84 13.8125 480.498 1.48142 489.967 1.50029L608.144 1.73584C617.613 1.75471 621.236 14.1003 613.276 19.2246L554.132 57.2963Z" stroke="#916FF1" strokeWidth="3"/>
        </svg>

        <div className="penalty-content">
          <p className="penalty-title">
            {autoTriggered
              ? 'YOU DID NOT HAVE ENOUGH TIME TO FINISH YOUR TASKS FOR THE DAY'
              : <>YOU HAVE <strong>FAILED</strong> TO COMPLETE ALL YOUR TASKS</>
            }
          </p>
          <p className="penalty-sub">you have disappointed US</p>
          <p className="penalty-sub">we will offer you one last chance</p>

          <div className="penalty-task-row">
            <div className="penalty-task-info">
              <span className="penalty-task-level">
                {penaltyData.task_difficulty === 'hard' ? 'HARD PENALTY' : 'EASY PENALTY'}
              </span>
              <span className="penalty-task-title">{penaltyData.task_title}</span>
            </div>
            <span className="penalty-timer">{formatTime(taskTimer)}</span>
          </div>

          <p className="penalty-warning">
            COMPLETE THIS WITHIN THE TIME ALLOCATED OR LOSE A DAYS WORTH OF XP
          </p>

          <button
            className={`penalty-confirm-btn ${!canConfirm ? 'locked' : ''}`}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            <span>
              {canConfirm ? 'CONFIRM COMPLETION' : `Button unlocks in ${formatTime(unlockTimer)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default PenaltyModal