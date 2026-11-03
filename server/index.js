// Starts the API server. The app itself is built in app.js.
const config = require('./config')
const app = require('./app')

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.stack || err)
})

app.listen(config.port, () => {
  console.log(`Rhabit server running on port ${config.port}`)
})
