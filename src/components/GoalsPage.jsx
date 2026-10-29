import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import cornerFrame from '../assets/images/cornerframe.svg'
import trashIcon from '../assets/icons/TrashGlyph.svg'
import LevelTaskEditor from './LevelTaskEditor'
import {
  getUser, getGoals, createGoal, updateGoalName,
  deleteGoal, starGoal, unstarGoal, saveGoalTasks
} from '../api'
import ModalFrame from './ModalFrame'

function GoalsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [goals, setGoals] = useState([])
  const [starred, setStarred] = useState(null)
  const [expandedGoal, setExpandedGoal] = useState(null)
  const [scrollThumbTop, setScrollThumbTop] = useState(0)
  const [scrollThumbHeight, setScrollThumbHeight] = useState(30)
  const [notice, setNotice] = useState(null)
  const scrollRef = useRef(null)
  const trackRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const [userData, goalsData] = await Promise.all([getUser(), getGoals()])
        setUser(userData)
        setGoals(goalsData.map(g => ({ ...g, editingName: false })))
        const starredGoal = goalsData.find(g => g.starred)
        if (starredGoal) setStarred(starredGoal.id)
      } catch (err) {
        console.error('Failed to load goals:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // recalculate scrollbar thumb whenever goals list changes
  useEffect(() => { handleScroll() }, [goals])

  function handleScroll() {
    const el = scrollRef.current
    const track = trackRef.current
    if (!el || !track) return
    const { scrollTop, scrollHeight, clientHeight } = el
    // size and place the thumb within the track's own inner height (it's
    // shorter than the scroll area), so it never runs past the track's border
    const trackH = track.clientHeight
    const thumbH = Math.min(trackH, Math.max(30, (clientHeight / scrollHeight) * trackH))
    const scrollable = scrollHeight - clientHeight
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, scrollTop / scrollable)) : 0
    setScrollThumbHeight(thumbH)
    setScrollThumbTop(progress * (trackH - thumbH))
  }

  // progress bar shows how far through the 10 levels the goal has come
  const progressPercent = (goal) => {
  const cappedLevel = Math.min(goal.level, 10)
  return Math.round((cappedLevel - 1) / 9 * 100)
  }

  async function addGoal() {
    try {
      const result = await createGoal(`Goal Pathway ${goals.length + 1}`)
      // e.g. the per-user goal cap was reached — show why and add nothing
      if (result.error) {
        setNotice(result.error)
        setTimeout(() => setNotice(null), 4000)
        return
      }
      const newGoal = {
        id: result.id,
        name: `Goal Pathway ${goals.length + 1}`,
        xp: 0,
        level: 1,
        starred: 0,
        levelTasks: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] },
        editingName: false
      }
      setGoals(prev => [...prev, newGoal])
    } catch (err) {
      console.error('Failed to add goal:', err)
    }
  }

  async function handleDeleteGoal(id) {
    try {
      await deleteGoal(id)
      setGoals(prev => prev.filter(g => g.id !== id))
      if (starred === id) setStarred(null)
    } catch (err) {
      console.error('Failed to delete goal:', err)
    }
  }

  async function handleStarGoal(id) {
    try {
      if (starred === id) {
        await unstarGoal(id)
        setStarred(null)
      } else {
        await starGoal(id)
        setStarred(id)
      }
    } catch (err) {
      console.error('Failed to star goal:', err)
    }
  }

  function startEditName(id) {
    setGoals(prev => prev.map(g => ({ ...g, editingName: g.id === id })))
  }

  async function saveName(id, value) {
    if (!value?.trim()) {
      setGoals(prev => prev.map(g => ({ ...g, editingName: false })))
      return
    }
    try {
      await updateGoalName(id, value.trim())
      setGoals(prev => prev.map(g =>
        g.id === id ? { ...g, name: value.trim(), editingName: false } : g
      ))
      if (expandedGoal?.id === id) {
        setExpandedGoal(prev => ({ ...prev, name: value.trim() }))
      }
    } catch (err) {
      console.error('Failed to save name:', err)
    }
  }

  // the task editor keeps its own tab/page state and resets each time it opens
  function openExpanded(goal) {
    setExpandedGoal(goal)
  }

  function closeExpanded() {
    setExpandedGoal(null)
  }

  // keeps the open goal and the list in sync as tasks are edited
  function updateExpandedLevel(level, list) {
    if (!expandedGoal) return
    const updatedGoal = {
      ...expandedGoal,
      levelTasks: { ...expandedGoal.levelTasks, [level]: list }
    }
    setExpandedGoal(updatedGoal)
    setGoals(prev => prev.map(g => g.id === expandedGoal.id ? updatedGoal : g))
  }

  // saves a level when an edit is finished (blur) or a task is deleted
  async function saveExpandedLevel(level, list) {
    if (!expandedGoal) return
    try {
      await saveGoalTasks(expandedGoal.id, level, list)
    } catch (err) {
      console.error('Failed to save tasks:', err)
    }
  }

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
    <div className="goals-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      {/* same toast style as the HomePage "SYSTEM UPDATE" message */}
      {notice && (
        <div role="alert" style={{
          position: 'fixed', top: '20px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(76, 66, 106, 0.95)',
          border: '2px solid #916FF1', borderRadius: '37px',
          padding: '12px 32px',
          fontFamily: 'var(--font-body)', fontSize: '22px',
          fontStyle: 'normal', color: '#C1AAFF',
          zIndex: 50, backdropFilter: 'blur(12px)', letterSpacing: '0'
        }}>
          ⚠ {notice}
        </div>
      )}

      <div className="goals-layout">
        <div className="goals-top-bar">
          <div className="goals-header-card">
            <svg width="100%" height="100%" viewBox="0 0 858 116" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M152.993 1.5L775.594 33.1045L854.458 114.5H1.5V1.5H152.993Z"
                fill="url(#hcGrad)" fillOpacity="0.22"/>
              {/* glass sheen: light across the upper part, clear lower down */}
              <path d="M152.993 1.5L775.594 33.1045L854.458 114.5H1.5V1.5H152.993Z" fill="url(#hcSheen)"/>
              <path d="M152.993 1.5L775.594 33.1045L854.458 114.5H1.5V1.5H152.993Z"
                fill="none" stroke="#916FF1" strokeWidth="3"/>
              <defs>
                <linearGradient id="hcSheen" x1="0" y1="0" x2="0.15" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
                  <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.04" />
                  <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hcGrad" x1="0" y1="58" x2="858" y2="58" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4C4269"/>
                  <stop offset="1" stopColor="#9682CF"/>
                </linearGradient>
              </defs>
            </svg>
            <span className="goals-title-text">YOUR GOALS</span>
          </div>

          <div className="goals-top-spacer" />

          <button className="add-goal-btn" onClick={addGoal}>
            <svg width="100%" height="100%" viewBox="0 0 276 76" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <g filter="url(#agFilter)">
                <path d="M62.5896 20.1787L266.998 3.3511L248.638 64.3511H150.31H11.9976L62.5896 20.1787Z" fill="#4C4269"/>
                <path d="M268.434 3.78371L250.074 64.7837L249.752 65.8511H7.99854L11.0112 63.2212L61.603 19.0484L61.9751 18.7241L62.4663 18.6841L266.875 1.85598L269.068 1.67532L268.434 3.78371Z" stroke="#916FF1" strokeWidth="3"/>
              </g>
              <defs>
                <filter id="agFilter" x="0" y="0" width="275.139" height="75.3511">
                  <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                  <feOffset dy="4"/>
                  <feGaussianBlur stdDeviation="2"/>
                  <feComposite in2="hardAlpha" operator="out"/>
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
                  <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
                </filter>
              </defs>
            </svg>
            <span className="add-goal-btn-text">Add GOAL</span>
          </button>

          <button className="goals-home-btn" onClick={() => navigate('/home')}>
            <svg width="100%" height="100%" viewBox="0 0 89 89" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="9.3" y="9.3" width="70" height="70" rx="6" fill="#D9D9D9" fillOpacity="0.2"/>
              <rect x="9.8" y="9.8" width="69" height="69" rx="5.5" stroke="#916FF1"/>
              <path d="M24.1748 65.0143H34.4873V49.3C34.4873 48.4095 34.8173 47.6636 35.4773 47.0623C36.1373 46.4609 36.9531 46.1592 37.9248 46.1571H51.6748C52.6488 46.1571 53.4657 46.4589 54.1257 47.0623C54.7857 47.6657 55.1146 48.4116 55.1123 49.3V65.0143H65.4248V36.7286L44.7998 22.5857L24.1748 36.7286V65.0143ZM17.2998 65.0143V36.7286C17.2998 35.7333 17.5439 34.7905 18.032 33.9C18.5201 33.0095 19.1927 32.2762 20.0498 31.7L40.6748 17.5571C41.8779 16.719 43.2529 16.3 44.7998 16.3C46.3467 16.3 47.7217 16.719 48.9248 17.5571L69.5498 31.7C70.4092 32.2762 71.0829 33.0095 71.571 33.9C72.0592 34.7905 72.3021 35.7333 72.2998 36.7286V65.0143C72.2998 66.7428 71.626 68.2231 70.2785 69.4551C68.931 70.6871 67.3131 71.3021 65.4248 71.3H51.6748C50.7008 71.3 49.885 70.9983 49.2273 70.3948C48.5696 69.7914 48.2396 69.0455 48.2373 68.1571V52.4428H41.3623V68.1571C41.3623 69.0476 41.0323 69.7946 40.3723 70.398C39.7123 71.0014 38.8965 71.3021 37.9248 71.3H24.1748C22.2842 71.3 20.6663 70.685 19.3211 69.4551C17.9758 68.2252 17.3021 66.7449 17.2998 65.0143Z" fill="#C0AAFF"/>
            </svg>
          </button>
        </div>

        <div className="goals-filebox-wrap">
          {/* frosted body of the file frame; its outline is drawn on top below */}
          <svg className="goals-filebox-body" viewBox="0 0 1590 877" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="fbBody" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(46, 35, 82, 0.52)" />
                <stop offset="1" stopColor="rgba(20, 15, 38, 0.64)" />
              </linearGradient>
            </defs>
            <path d="M1.5 1.5H1567.66L1485.55 854.71H1.5V1.5Z" fill="url(#fbBody)" />
          </svg>
          <div className="goals-filebox-inner">
            <div className="goals-filebox-header-zone" />

            <div className="goals-scroll-area" ref={scrollRef} onScroll={handleScroll}>
              {goals.length === 0 ? (
                <p className="goals-empty">No goal pathways yet — click Add GOAL to get started</p>
              ) : (
                goals.map(goal => (
                  <div className="goal-row-wrap" key={goal.id}>
                    <svg className="goal-row-svg" viewBox="0 0 1263 109" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                      {/* glass edge: a hairline that catches the light at the top
                          corners, fades down the sides and settles faint along the
                          bottom. The top edge is drawn on its own so it can fade out
                          across the middle instead of running unbroken. */}
                      <defs>
                        <linearGradient id={`edge-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#E4DAFF" stopOpacity={starred === goal.id ? '0.85' : '0.6'} />
                          <stop offset="0.5" stopColor="#C1AAFF" stopOpacity="0.22" />
                          <stop offset="1" stopColor="#C1AAFF" stopOpacity="0.32" />
                        </linearGradient>
                        {/* top edge: full strength from each corner, holding for
                            about a fifth of the width, then fading out before the middle */}
                        {/* sized in the card's own units: a flat line has no height, so a
                            gradient sized to its box would not be drawn at all */}
                        <linearGradient id={`top-${goal.id}`} gradientUnits="userSpaceOnUse" x1="24.7303" y1="0" x2="1263" y2="0">
                          <stop offset="0" stopColor="#E4DAFF" stopOpacity={starred === goal.id ? '0.85' : '0.6'} />
                          <stop offset="0.18" stopColor="#E4DAFF" stopOpacity={starred === goal.id ? '0.7' : '0.48'} />
                          <stop offset="0.4" stopColor="#E4DAFF" stopOpacity="0" />
                          <stop offset="0.6" stopColor="#E4DAFF" stopOpacity="0" />
                          <stop offset="0.82" stopColor="#E4DAFF" stopOpacity={starred === goal.id ? '0.7' : '0.48'} />
                          <stop offset="1" stopColor="#E4DAFF" stopOpacity={starred === goal.id ? '0.85' : '0.6'} />
                        </linearGradient>
                      </defs>
                      <path d="M0 109H1215.39L1263 0H24.7303L0 109Z"
                        fill={starred === goal.id ? "rgba(145,111,241,0.30)" : "rgba(79,66,118,0.20)"}/>
                      {/* sides and bottom */}
                      <path d="M1263 0L1215.39 109H0L24.7303 0" fill="none"
                        stroke={`url(#edge-${goal.id})`} strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
                      {/* top: the same thin line as the sides, fading out before the middle */}
                      <path d="M24.7303 0H1263" fill="none"
                        stroke={`url(#top-${goal.id})`} strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
                    </svg>
                    <div className="goal-row-content">
                      <div className="goal-name-wrap">
                        {goal.editingName ? (
                          <input
                            className="goal-name-input"
                            defaultValue={goal.name}
                            autoFocus
                            onBlur={e => saveName(goal.id, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveName(goal.id, e.target.value)}
                            maxLength={30}
                          />
                        ) : (
                          <span className="goal-name" onClick={() => startEditName(goal.id)}>
                            {goal.name}:
                          </span>
                        )}
                      </div>
                      <div className="goal-progress-bar-wrap">
                        <svg viewBox="0 0 404 34" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }} xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <clipPath id={`pg-${goal.id}`}>
                              <path d="M0 34H388.77L404 0H7.91055L0 34Z"/>
                            </clipPath>
                          </defs>
                          <path d="M0 34H388.77L404 0H7.91055L0 34Z" fill="#1B142C"/>
                          <rect x="0" y="0" width={`${progressPercent(goal) === 100 ? 404 : progressPercent(goal) * 3.96}`} height="34" fill="#916FF1" clipPath={`url(#pg-${goal.id})`}/>
                          <path d="M0 34H388.77L404 0H7.91055L0 34Z" fill="none" stroke="#916FF133" strokeWidth="1.5"/>
                        </svg>
                      </div>
                      <span className="goal-progress-text">Progress: {progressPercent(goal)}%</span>
                      <div className="goal-actions">
                        <button
                          className={`goal-action-btn ${starred === goal.id ? 'goal-starred' : ''}`}
                          onClick={() => handleStarGoal(goal.id)}
                          aria-label={starred === goal.id ? 'Unstar goal' : 'Star goal'}
                          aria-pressed={starred === goal.id}
                        >
                          <svg viewBox="18 18 44 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M49.4161 37.6L48.9307 39.8H43.3486C43.0267 39.8 42.7181 39.9159 42.4905 40.1222C42.2629 40.3285 42.1351 40.6083 42.1351 40.9C42.1351 41.1917 42.2629 41.4715 42.4905 41.6778C42.7181 41.8841 43.0267 42 43.3486 42H48.4453L46.0183 53H40.9216C40.5997 53 40.2911 53.1159 40.0635 53.3222C39.8359 53.5285 39.7081 53.8083 39.7081 54.1C39.7081 54.3917 39.8359 54.6715 40.0635 54.8778C40.2911 55.0841 40.5997 55.2 40.9216 55.2H45.5329L44.5621 59.6C44.5621 60.767 44.0507 61.8861 43.1404 62.7113C42.2301 63.5364 40.9954 64 39.7081 64C38.4207 64 37.1861 63.5364 36.2757 62.7113C35.3654 61.8861 34.854 60.767 34.854 59.6L32.427 48.6H36.0675C36.3894 48.6 36.698 48.4841 36.9256 48.2778C37.1532 48.0715 37.281 47.7917 37.281 47.5C37.281 47.2083 37.1532 46.9285 36.9256 46.7222C36.698 46.5159 36.3894 46.4 36.0675 46.4H31.9416L30 37.6C30 34.96 32.2571 32.694 35.5579 31.638L32.1843 27.216C32.0033 26.9779 31.876 26.7098 31.8098 26.427C31.7435 26.1441 31.7396 25.8522 31.7982 25.568C31.8569 25.2838 31.9769 25.013 32.1515 24.771C32.326 24.529 32.5516 24.3207 32.8153 24.158C33.3434 23.8262 33.9951 23.6978 34.6275 23.8009C35.2599 23.904 35.8214 24.2302 36.1889 24.708L37.281 26.16V22.2C37.281 21.6165 37.5368 21.0569 37.9919 20.6444C38.4471 20.2318 39.0644 20 39.7081 20C40.3517 20 40.9691 20.2318 41.4242 20.6444C41.8794 21.0569 42.1351 21.6165 42.1351 22.2V27.216L45.7756 23.388C46.5765 22.464 48.1298 22.354 49.1492 23.146C50.1685 23.916 50.2899 25.302 49.4161 26.248L44.2466 31.77C47.3289 32.87 49.4161 35.07 49.4161 37.6Z"
                              fill="currentColor"/>
                          </svg>
                        </button>
                        <button className="goal-action-btn" onClick={() => openExpanded(goal)} aria-label="Open goal tasks">
                          <svg viewBox="18 18 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M40 23V58M30 44.875L40 58L50 44.875" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button className="goal-action-btn" onClick={() => handleDeleteGoal(goal.id)} aria-label="Delete goal">
                          <img src={trashIcon} alt="" className="goal-action-glyph"/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="goals-scrollbar-track" ref={trackRef}>
              <div className="goals-scrollbar-thumb" style={{ height: `${scrollThumbHeight}px`, top: `${scrollThumbTop}px` }}/>
            </div>
          </div>

          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 }}
            viewBox="0 0 1590 877" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 1.5H1567.66L1485.55 854.71H1.5V1.5Z" fill="none" stroke="#916FF1" strokeWidth="3"/>
          </svg>
        </div>
      </div>

      {expandedGoal && (
        <div className="modal-overlay" onClick={closeExpanded}>
          <div className="expanded-goal-box" onClick={e => e.stopPropagation()}>
            <ModalFrame className="expanded-goal-frame" />

            <div className="expanded-goal-content">
              <h2 className="expanded-goal-title">{expandedGoal.name}: Level {expandedGoal.level}</h2>

              <LevelTaskEditor
                key={expandedGoal.id}
                tasksByLevel={expandedGoal.levelTasks}
                onChange={updateExpandedLevel}
                onCommit={saveExpandedLevel}
                listClassName="expanded-task-list"
                emptyMessage="No tasks yet — click Add Task"
                placeholder="Click to Edit"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoalsPage