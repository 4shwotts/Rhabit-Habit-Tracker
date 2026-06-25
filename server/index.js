require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { checkDailyReset } = require('./middleware/checkDailyReset')

require('./db/database')

const app = express()

// only allow requests from the local frontend
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
app.use(express.json())

const userRoutes = require('./routes/user')
const goalRoutes = require('./routes/goals')
const dailyRoutes = require('./routes/daily')

// check if the day has rolled over before every request
app.use(checkDailyReset)

app.use('/api/user', userRoutes)
app.use('/api/goals', goalRoutes)
app.use('/api/daily', dailyRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Rhabit server running on port ${PORT}`)
})