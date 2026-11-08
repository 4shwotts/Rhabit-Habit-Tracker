// Starts the API server. The app itself is built in app.js.
const config = require('./config')
const app = require('./app')
const { query } = require('./db')
const { deleteExpiredDemos } = require('./lib/demo')

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.stack || err)
})

// Expired demo accounts are deleted when the server starts, every hour while it
// runs, and whenever a new demo is created (routes/auth.js). Render's free tier
// sleeps, so the hourly run alone wouldn't be enough.
async function cleanUpDemos() {
  try {
    const deleted = await deleteExpiredDemos({ query })
    if (deleted > 0) console.log(`Deleted ${deleted} expired demo account(s)`)
  } catch (err) {
    console.error('Demo clean-up failed:', err.message)
  }
}
cleanUpDemos()
// unref: this timer alone never keeps the process running
setInterval(cleanUpDemos, 60 * 60 * 1000).unref()

app.listen(config.port, () => {
  console.log(`Rhabit server running on port ${config.port}`)
})
