require('dotenv').config()
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { checkDailyReset } = require('./middleware/checkDailyReset')

require('./db/database')

const app = express()

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'https://rhabit-habit-tracker.vercel.app'] }))
app.use(express.json())

const userRoutes = require('./routes/user')
const goalRoutes = require('./routes/goals')
const dailyRoutes = require('./routes/daily')

app.use(checkDailyReset)

app.use('/api/user', userRoutes)
app.use('/api/goals', goalRoutes)
app.use('/api/daily', dailyRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// demo reset endpoint — restores the database to the original seed state
app.post('/api/reset-demo', (req, res) => {
  const dbPath = path.join(__dirname, 'db', 'rhabit.db')
  const seedPath = path.join(__dirname, 'db', 'rhabit_seed.db')
  if (fs.existsSync(seedPath)) {
    fs.copyFileSync(seedPath, dbPath)
    console.log('Demo reset triggered by user')
    res.json({ success: true })
  } else {
    res.status(500).json({ error: 'Seed database not found' })
  }
})

// resets the live database back to the seed state at midnight every day
function scheduleMidnightReset() {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const msUntilMidnight = midnight - now

  setTimeout(() => {
    const dbPath = path.join(__dirname, 'db', 'rhabit.db')
    const seedPath = path.join(__dirname, 'db', 'rhabit_seed.db')
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, dbPath)
      console.log('Database reset to seed state at midnight')
    }
    scheduleMidnightReset()
  }, msUntilMidnight)
}

scheduleMidnightReset()

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Rhabit server running on port ${PORT}`)
})