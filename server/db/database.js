const { db, initDB } = require('./schema')

// run schema setup on first import
initDB()

module.exports = db