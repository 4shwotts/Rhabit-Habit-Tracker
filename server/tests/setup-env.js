// Runs before every test file, before any server code is loaded.
//
// NODE_ENV=test stops config.js reading server/.env (which points at the real
// database), so everything the server needs is set here instead.

process.env.NODE_ENV = 'test'
// fixed time zone, so date maths gives the same answer on every machine
process.env.TZ = 'UTC'
// test the real game values, not the 30-second local testing timers
process.env.TEST_TIMERS = ''
// never send real email from a test
process.env.BREVO_API_KEY = ''

// The only database tests may use. TEST_DATABASE_URL overrides the local
// default (CI sets it); DATABASE_URL itself is ignored on purpose, as it may be
// the live one.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5433/rhabit_test'

// refuse anything that looks like a hosted (production) database
if (/neon\.tech|render\.com|amazonaws\.com/i.test(testDatabaseUrl)) {
  throw new Error('Refusing to run tests against a hosted database: ' + testDatabaseUrl.replace(/\/\/.*@/, '//***@'))
}
process.env.DATABASE_URL = testDatabaseUrl
