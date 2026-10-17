// Postgres (Neon) access layer using a node-postgres connection pool.
//
// All SQL must use $1, $2… placeholders. Never build SQL with string
// concatenation or template literals containing user input.
const { Pool, types } = require('pg')
const config = require('../config')

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects
// (which would be shifted into the server's timezone). The daily reset compares
// these directly with the user's local date string.
const DATE_OID = 1082
types.setTypeParser(DATE_OID, value => value)

// Neon connection strings include ?sslmode=require, which node-postgres turns
// into a verified TLS connection.
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
})

// Neon closes idle connections; without this listener an error on an idle
// client would crash the process.
pool.on('error', err => {
  console.error('Postgres pool error:', err.message)
})

function query(sql, params = []) {
  return pool.query(sql, params)
}

// Runs `fn(client)` inside a transaction on a single pooled connection.
// Use `client.query` (not the top-level `query`) for everything inside `fn`.
async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

module.exports = { pool, query, withTransaction }
