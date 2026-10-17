const config = require('./config')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { requireAuth, requireVerified } = require('./middleware/requireAuth')
const { checkDailyReset } = require('./middleware/checkDailyReset')

const app = express()

// credentials: true lets the browser send the session cookie on direct calls
// (in production the Vercel proxy makes requests same-origin anyway)
app.use(cors({ origin: config.corsOrigins, credentials: true }))
app.use(express.json())
app.use(cookieParser())

const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/user')
const goalRoutes = require('./routes/goals')
const dailyRoutes = require('./routes/daily')

// public: account routes (they apply requireAuth themselves where needed)
app.use('/api/auth', authRoutes)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// everything else requires a logged-in, verified user; the daily reset then
// runs for that user only
const gameGuards = [requireAuth, requireVerified, checkDailyReset]
app.use('/api/user', ...gameGuards, userRoutes)
app.use('/api/goals', ...gameGuards, goalRoutes)
app.use('/api/daily', ...gameGuards, dailyRoutes)

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// last-resort error handler — logs the detail server-side, returns a generic message
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status && err.status < 500 ? err.status : 500).json({
    error: err.status && err.status < 500 ? 'Bad request' : 'Something went wrong'
  })
})

app.listen(config.port, () => {
  console.log(`Rhabit server running on port ${config.port}`)
})
