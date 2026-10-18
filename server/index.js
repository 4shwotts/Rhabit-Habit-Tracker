const config = require('./config')
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { requireAuth, requireVerified } = require('./middleware/requireAuth')
const { checkDailyReset } = require('./middleware/checkDailyReset')
const limits = require('./middleware/rateLimits')

const app = express()

// so req.ip is the real client (rate limiting) — see config.trustProxy
app.set('trust proxy', config.trustProxy)

// security headers (also removes X-Powered-By)
app.use(helmet())

// only the frontend origin(s) may call the API from a browser; credentials lets
// the session cookie through on direct calls (production goes via the Vercel
// proxy, so the browser sees it as same-origin anyway)
app.use(cors({ origin: config.corsOrigins, credentials: true }))

// CSRF defence in depth on top of SameSite=Lax cookies: browsers always send
// an Origin header on cross-site writes, so refuse writes from any origin
// that isn't ours. Requests with no Origin (curl, server-to-server) carry no
// browser cookies from another site, so they can't be CSRF.
app.use((req, res, next) => {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  const origin = req.get('origin')
  if (!safe && origin && !config.corsOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
})

// small JSON bodies only — the largest legitimate request is a 6-task list
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

app.use('/api', limits.general)

const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/user')
const goalRoutes = require('./routes/goals')
const dailyRoutes = require('./routes/daily')
const setupRoutes = require('./routes/setup')

// public: account routes (they apply requireAuth themselves where needed)
app.use('/api/auth', authRoutes)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// everything else requires a logged-in, verified user; the daily reset then
// runs for that user only
const gameGuards = [requireAuth, requireVerified, checkDailyReset]
app.use('/api/user', ...gameGuards, userRoutes)
app.use('/api/goals', ...gameGuards, goalRoutes)
app.use('/api/daily', ...gameGuards, dailyRoutes)
app.use('/api/setup', ...gameGuards, setupRoutes)

app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// Last-resort error handler. Details are logged server-side only; the client
// gets a generic message, never a stack trace or database error.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' })

  // stack only: pg errors carry a `detail` field that can contain user data
  console.error(err.stack || err.message)
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : 'Bad request' })
})

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.stack || err)
})

app.listen(config.port, () => {
  console.log(`Rhabit server running on port ${config.port}`)
})
