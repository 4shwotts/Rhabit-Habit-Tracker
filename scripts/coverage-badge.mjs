// Turns the server's coverage summary into the JSON that shields.io reads for
// the README badge, so the badge can't go out of date. Run by CI.
// usage: node scripts/coverage-badge.mjs <coverage-summary.json> <output.json>
import fs from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/coverage-badge.mjs <coverage-summary.json> <output.json>')
  process.exit(1)
}

const percent = Math.floor(JSON.parse(fs.readFileSync(input, 'utf8')).total.lines.pct)
const color = percent >= 80 ? 'brightgreen' : percent >= 60 ? 'yellow' : 'red'

fs.writeFileSync(output, JSON.stringify({
  schemaVersion: 1,
  label: 'server coverage',
  message: `${percent}%`,
  color
}))
console.log(`Server coverage: ${percent}%`)
