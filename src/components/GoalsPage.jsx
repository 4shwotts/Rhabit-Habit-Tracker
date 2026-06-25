import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import cornerFrame from '../assets/images/cornerframe.svg'
import trashIcon from '../assets/icons/TrashButton.svg'
import leftArrow from '../assets/icons/leftarrow.svg'
import rightArrow from '../assets/icons/rightarrow.svg'
import editIcon from '../assets/icons/EditButton.svg'
import {
  getUser, getGoals, createGoal, updateGoalName,
  deleteGoal, starGoal, unstarGoal, saveGoalTasks
} from '../api'

const TASKS_PER_PAGE = 3

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

function GoalsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [goals, setGoals] = useState([])
  const [starred, setStarred] = useState(null)
  const [expandedGoal, setExpandedGoal] = useState(null)
  const [expandedTabPage, setExpandedTabPage] = useState(0)
  const [expandedActiveLevel, setExpandedActiveLevel] = useState(1)
  const [expandedTaskPage, setExpandedTaskPage] = useState(0)
  const [editingTaskIndex, setEditingTaskIndex] = useState(null)
  const [scrollThumbTop, setScrollThumbTop] = useState(0)
  const [scrollThumbHeight, setScrollThumbHeight] = useState(30)
  const scrollRef = useRef(null)

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

  useEffect(() => {
    setExpandedTaskPage(0)
    setEditingTaskIndex(null)
  }, [expandedActiveLevel])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const thumbH = Math.max(30, (clientHeight / scrollHeight) * clientHeight)
    const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbH)
    setScrollThumbHeight(thumbH)
    setScrollThumbTop(isNaN(thumbTop) ? 0 : thumbTop)
  }

  // progress bar shows how far through the 10 levels the goal has come
  const progressPercent = (goal) => {
    return Math.round((goal.level - 1) / 9 * 100)
  }

  async function addGoal() {
    try {
      const result = await createGoal(`Goal Pathway ${goals.length + 1}`)
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

  function openExpanded(goal) {
    setExpandedGoal(goal)
    setExpandedTabPage(0)
    setExpandedActiveLevel(1)
    setExpandedTaskPage(0)
    setEditingTaskIndex(null)
  }

  function closeExpanded() {
    setExpandedGoal(null)
    setEditingTaskIndex(null)
  }

  function getCurrentLevelTasks() {
    if (!expandedGoal) return []
    return expandedGoal.levelTasks?.[expandedActiveLevel] || []
  }

  function updateExpandedTask(index, value) {
    if (!expandedGoal) return
    const currentTasks = [...getCurrentLevelTasks()]
    currentTasks[index] = { ...currentTasks[index], title: value }
    const updatedGoal = {
      ...expandedGoal,
      levelTasks: { ...expandedGoal.levelTasks, [expandedActiveLevel]: currentTasks }
    }
    setExpandedGoal(updatedGoal)
    setGoals(prev => prev.map(g => g.id === expandedGoal.id ? updatedGoal : g))
  }

  async function deleteExpandedTask(index) {
    if (!expandedGoal) return
    const currentTasks = getCurrentLevelTasks().filter((_, i) => i !== index)
    const updatedGoal = {
      ...expandedGoal,
      levelTasks: { ...expandedGoal.levelTasks, [expandedActiveLevel]: currentTasks }
    }
    setExpandedGoal(updatedGoal)
    setGoals(prev => prev.map(g => g.id === expandedGoal.id ? updatedGoal : g))
    await saveGoalTasks(expandedGoal.id, expandedActiveLevel, currentTasks)
    const totalPages = Math.ceil(currentTasks.length / TASKS_PER_PAGE)
    if (expandedTaskPage >= totalPages && expandedTaskPage > 0) {
      setExpandedTaskPage(totalPages - 1)
    }
  }

  async function addExpandedTask() {
    if (!expandedGoal) return
    const currentTasks = getCurrentLevelTasks()
    if (currentTasks.length >= 6) return
    const newTasks = [...currentTasks, { title: '' }]
    const updatedGoal = {
      ...expandedGoal,
      levelTasks: { ...expandedGoal.levelTasks, [expandedActiveLevel]: newTasks }
    }
    setExpandedGoal(updatedGoal)
    setGoals(prev => prev.map(g => g.id === expandedGoal.id ? updatedGoal : g))
    const newPage = Math.floor((newTasks.length - 1) / TASKS_PER_PAGE)
    setExpandedTaskPage(newPage)
    setEditingTaskIndex(newTasks.length - 1)
  }

  // saves on blur rather than on every keystroke
  async function saveExpandedTasks() {
    if (!expandedGoal) return
    try {
      await saveGoalTasks(expandedGoal.id, expandedActiveLevel, getCurrentLevelTasks())
    } catch (err) {
      console.error('Failed to save tasks:', err)
    }
  }

  const expandedLevels = expandedTabPage === 0 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10]
  const currentLevelTasks = expandedGoal ? getCurrentLevelTasks() : []
  const totalTaskPages = Math.max(1, Math.ceil(currentLevelTasks.length / TASKS_PER_PAGE))
  const pagedTasks = currentLevelTasks.slice(
    expandedTaskPage * TASKS_PER_PAGE,
    expandedTaskPage * TASKS_PER_PAGE + TASKS_PER_PAGE
  )

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
    <div className="goals-page">
      <img src={cornerFrame} className="corner top-left" alt="" />
      <img src={cornerFrame} className="corner top-right" alt="" />
      <img src={cornerFrame} className="corner bottom-left" alt="" />
      <img src={cornerFrame} className="corner bottom-right" alt="" />

      <div className="goals-layout">
        <div className="goals-top-bar">
          <div className="goals-header-card">
            <svg width="100%" height="100%" viewBox="0 0 858 116" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M152.993 1.5L775.594 33.1045L854.458 114.5H1.5V1.5H152.993Z"
                fill="url(#hcGrad)" fillOpacity="0.2" stroke="#916FF1" strokeWidth="3"/>
              <defs>
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
          <div className="goals-filebox-inner">
            <div className="goals-filebox-header-zone" />

            <div className="goals-scroll-area" ref={scrollRef} onScroll={handleScroll}>
              {goals.length === 0 ? (
                <p className="goals-empty">No goal pathways yet — click Add GOAL to get started</p>
              ) : (
                goals.map(goal => (
                  <div className="goal-row-wrap" key={goal.id}>
                    <svg className="goal-row-svg" viewBox="0 0 1263 109" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 109H1215.39L1263 0H24.7303L0 109Z"
                        fill={starred === goal.id ? "rgba(145,111,241,0.30)" : "rgba(79,66,118,0.20)"}
                        strokeWidth="0"/>
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
                          <rect x="4" y="4" width={`${progressPercent(goal) * 3.88}`} height="26" fill="#916FF1" clipPath={`url(#pg-${goal.id})`}/>
                          <path d="M0 34H388.77L404 0H7.91055L0 34Z" fill="none" stroke="#916FF133" strokeWidth="1.5"/>
                        </svg>
                      </div>
                      <span className="goal-progress-text">Progress: {progressPercent(goal)}%</span>
                      <div className="goal-actions">
                        <button
                          className={`goal-action-btn ${starred === goal.id ? 'goal-starred' : ''}`}
                          onClick={() => handleStarGoal(goal.id)}
                        >
                          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="5" y="5" width="70" height="70" rx="35"
                              fill="#4C4269" fillOpacity={starred === goal.id ? "0.7" : "0.2"}/>
                            <rect x="5" y="5" width="70" height="70" rx="35"
                              stroke={starred === goal.id ? "#C1AAFF" : "#916FF1"}
                              strokeWidth={starred === goal.id ? "2.5" : "1.5"}/>
                            <path d="M49.4161 37.6L48.9307 39.8H43.3486C43.0267 39.8 42.7181 39.9159 42.4905 40.1222C42.2629 40.3285 42.1351 40.6083 42.1351 40.9C42.1351 41.1917 42.2629 41.4715 42.4905 41.6778C42.7181 41.8841 43.0267 42 43.3486 42H48.4453L46.0183 53H40.9216C40.5997 53 40.2911 53.1159 40.0635 53.3222C39.8359 53.5285 39.7081 53.8083 39.7081 54.1C39.7081 54.3917 39.8359 54.6715 40.0635 54.8778C40.2911 55.0841 40.5997 55.2 40.9216 55.2H45.5329L44.5621 59.6C44.5621 60.767 44.0507 61.8861 43.1404 62.7113C42.2301 63.5364 40.9954 64 39.7081 64C38.4207 64 37.1861 63.5364 36.2757 62.7113C35.3654 61.8861 34.854 60.767 34.854 59.6L32.427 48.6H36.0675C36.3894 48.6 36.698 48.4841 36.9256 48.2778C37.1532 48.0715 37.281 47.7917 37.281 47.5C37.281 47.2083 37.1532 46.9285 36.9256 46.7222C36.698 46.5159 36.3894 46.4 36.0675 46.4H31.9416L30 37.6C30 34.96 32.2571 32.694 35.5579 31.638L32.1843 27.216C32.0033 26.9779 31.876 26.7098 31.8098 26.427C31.7435 26.1441 31.7396 25.8522 31.7982 25.568C31.8569 25.2838 31.9769 25.013 32.1515 24.771C32.326 24.529 32.5516 24.3207 32.8153 24.158C33.3434 23.8262 33.9951 23.6978 34.6275 23.8009C35.2599 23.904 35.8214 24.2302 36.1889 24.708L37.281 26.16V22.2C37.281 21.6165 37.5368 21.0569 37.9919 20.6444C38.4471 20.2318 39.0644 20 39.7081 20C40.3517 20 40.9691 20.2318 41.4242 20.6444C41.8794 21.0569 42.1351 21.6165 42.1351 22.2V27.216L45.7756 23.388C46.5765 22.464 48.1298 22.354 49.1492 23.146C50.1685 23.916 50.2899 25.302 49.4161 26.248L44.2466 31.77C47.3289 32.87 49.4161 35.07 49.4161 37.6Z"
                              fill={starred === goal.id ? "#C1AAFF" : "#916FF1"}/>
                          </svg>
                        </button>
                        <button className="goal-action-btn" onClick={() => openExpanded(goal)}>
                          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="5" y="5" width="70" height="70" rx="35" fill="#4C4269" fillOpacity="0.2"/>
                            <rect x="5" y="5" width="70" height="70" rx="35" stroke="#916FF1" strokeWidth="1.5"/>
                            <path d="M40 23V58M30 44.875L40 58L50 44.875" stroke="#C1AAFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button className="goal-action-btn" onClick={() => handleDeleteGoal(goal.id)}>
                          <img src={trashIcon} alt="delete" style={{ width: '100%', height: '100%' }}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="goals-scrollbar-track">
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
            <svg className="expanded-goal-frame" viewBox="0 0 1100 696" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="14.3869" y="15.3021" width="1070.09" height="661.091" rx="32.0457" fill="#382A60" fillOpacity="0.2" stroke="#916FF1" strokeWidth="3.90864"/>
              <path d="M32.6047 8.00756C29.6231 8.00968 26.8897 9.67105 25.5134 12.3178L7.96124 46.0714C4.22638 53.2537 12.2915 60.8054 19.2076 56.6017L74.7854 22.821C81.7015 18.6174 78.7218 7.97471 70.6304 7.98048L32.6047 8.00756Z" fill="#1C1927"/>
              <path d="M32.604 6.50695C29.0634 6.50948 25.8174 8.48246 24.183 11.6253L6.63093 45.3794C2.19595 53.9083 11.7735 62.8755 19.9862 57.8837L75.5636 24.1033C83.7763 19.1115 80.2383 6.47355 70.6301 6.48009L32.604 6.50695Z" stroke="#916FF1" strokeWidth="3"/>
              <path d="M1066.56 8.00756C1069.54 8.00968 1072.27 9.67105 1073.65 12.3178L1091.2 46.0714C1094.94 53.2537 1086.87 60.8054 1079.96 56.6017L1024.38 22.821C1017.46 18.6174 1020.44 7.97471 1028.53 7.98048L1066.56 8.00756Z" fill="#1C1927"/>
              <path d="M1066.56 6.50695C1070.1 6.50948 1073.35 8.48246 1074.98 11.6253L1092.53 45.3794C1096.97 53.9083 1087.39 62.8755 1079.18 57.8837L1023.6 24.1033C1015.39 19.1115 1018.93 6.47355 1028.53 6.48009L1066.56 6.50695Z" stroke="#916FF1" strokeWidth="3"/>
              <path d="M1066.56 684.282C1069.54 684.28 1072.27 682.618 1073.65 679.971L1091.2 646.218C1094.94 639.035 1086.87 631.484 1079.96 635.687L1024.38 669.468C1017.46 673.672 1020.44 684.314 1028.53 684.309L1066.56 684.282Z" fill="#1C1927"/>
              <path d="M1066.56 685.782C1070.1 685.78 1073.35 683.807 1074.98 680.664L1092.53 646.91C1096.97 638.381 1087.39 629.414 1079.18 634.405L1023.6 668.186C1015.39 673.178 1018.93 685.816 1028.53 685.809L1066.56 685.782Z" stroke="#916FF1" strokeWidth="3"/>
              <path d="M32.6047 684.282C29.6231 684.28 26.8897 682.618 25.5134 679.971L7.96124 646.218C4.22638 639.035 12.2915 631.484 19.2076 635.687L74.7854 669.468C81.7015 673.672 78.7218 684.314 70.6304 684.309L32.6047 684.282Z" fill="#1C1927"/>
              <path d="M32.604 685.782C29.0634 685.78 25.8174 683.807 24.183 680.664L6.63093 646.91C2.19595 638.381 11.7735 629.414 19.9862 634.405L75.5636 668.186C83.7763 673.178 80.2383 685.816 70.6301 685.809L32.604 685.782Z" stroke="#916FF1" strokeWidth="3"/>
              <path d="M553.32 56.0348C550.674 57.7377 547.275 57.731 544.635 56.0175L485.601 17.7102C478.91 13.3684 481.99 2.98411 489.965 3L608.142 3.23555C616.116 3.25144 619.166 13.6479 612.463 17.963L553.32 56.0348Z" fill="#1C1927" fillOpacity="0.2"/>
              <path d="M554.132 57.2961C550.991 59.3184 546.954 59.3103 543.819 57.2756L484.785 18.9684C476.84 13.8124 480.498 1.4813 489.967 1.50017L608.144 1.73571C617.613 1.75459 621.236 14.1002 613.276 19.2245L554.132 57.2961Z" stroke="#916FF1" strokeWidth="3"/>
            </svg>

            <div className="expanded-goal-content">
              <h2 className="expanded-goal-title">{expandedGoal.name}: Level {expandedGoal.level}</h2>

              <div className="tabs-carousel">
                <button className="carousel-arrow"
                  onClick={() => { setExpandedTabPage(0); setExpandedActiveLevel(1) }}
                  disabled={expandedTabPage === 0}>
                  <img src={leftArrow} alt="prev"/>
                </button>
                <div className="level-tabs">
                  {expandedLevels.map(l => (
                    <button key={l}
                      className={`level-tab ${expandedActiveLevel === l ? 'active' : ''}`}
                      onClick={() => setExpandedActiveLevel(l)}>
                      Level {l} Tasks
                    </button>
                  ))}
                </div>
                <button className="carousel-arrow"
                  onClick={() => { setExpandedTabPage(1); setExpandedActiveLevel(6) }}
                  disabled={expandedTabPage === 1}>
                  <img src={rightArrow} alt="next"/>
                </button>
              </div>

              <p className="window-info-label">⏱ {getWindowDescription(expandedActiveLevel)}</p>

              <div className="expanded-task-list">
                {pagedTasks.length === 0 ? (
                  <p className="expanded-no-tasks">No tasks yet — click Add Task</p>
                ) : (
                  pagedTasks.map((task, i) => {
                    const globalIndex = expandedTaskPage * TASKS_PER_PAGE + i
                    return (
                      <div className="task-row" key={globalIndex}>
                        <div className="task-text">
                          <span className="task-level-label">
                            Level {expandedActiveLevel} Task — {getWindowLabel(expandedActiveLevel)} timer
                          </span>
                          <input
                            className="task-edit-input"
                            type="text"
                            value={task.title}
                            placeholder="Click to Edit"
                            readOnly={editingTaskIndex !== globalIndex}
                            onChange={e => updateExpandedTask(globalIndex, e.target.value)}
                            onBlur={() => saveExpandedTasks()}
                            maxLength={40}
                          />
                        </div>
                        <div className="task-actions">
                          <button
                            className={`task-icon-btn ${editingTaskIndex === globalIndex ? 'editing' : ''}`}
                            onClick={() => setEditingTaskIndex(editingTaskIndex === globalIndex ? null : globalIndex)}>
                            <img src={editIcon} alt="edit" width="50" height="50"/>
                          </button>
                          <button className="task-icon-btn" onClick={() => deleteExpandedTask(globalIndex)}>
                            <img src={trashIcon} alt="delete" width="50" height="50"/>
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
                    className={`page-dot ${expandedTaskPage === 0 ? 'active' : 'inactive'}`}
                    onClick={() => { setExpandedTaskPage(p => Math.max(0, p - 1)); setEditingTaskIndex(null) }}
                  />
                  <button
                    className={`page-dot ${expandedTaskPage > 0 ? 'active' : 'inactive'}`}
                    onClick={() => { setExpandedTaskPage(p => Math.min(totalTaskPages - 1, p + 1)); setEditingTaskIndex(null) }}
                  />
                </div>
                <button
                  className="add-task-btn"
                  onClick={addExpandedTask}
                  disabled={getCurrentLevelTasks().length >= 6}
                >
                  Add Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoalsPage