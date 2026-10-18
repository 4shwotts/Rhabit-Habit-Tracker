// Sign-up email check: refuses throwaway inboxes and domains that can't receive
// mail, so every account has an address we can actually verify.
const dns = require('dns').promises

// ~134,000 known disposable-email domains (mailinator, 10minutemail, …),
// from the regularly updated `disposable-domains` package
const DISPOSABLE = new Set(require('disposable-domains'))

const DNS_TIMEOUT_MS = 4000

// true if the domain, or any parent of it, is on the disposable list
// (catches "abc.mailinator.com" as well as "mailinator.com")
function isDisposable(domain) {
  const parts = domain.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join('.'))) return true
  }
  return false
}

// true if the domain publishes at least one real mail server (MX record).
// A "null MX" (exchange ".") explicitly means the domain accepts no mail.
async function receivesMail(domain) {
  const lookup = dns.resolveMx(domain)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS)
  )
  try {
    const records = await Promise.race([lookup, timeout])
    return records.some(r => r.exchange && r.exchange !== '.')
  } catch (err) {
    // the domain definitely has no mail servers
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return false
    // DNS itself failed (timeout, server error): don't lock real people out
    // because of a network blip — let it through and rely on verification
    console.warn(`MX lookup failed for sign-up domain (${err.code}); allowing`)
    return true
  }
}

// Returns true if the address is acceptable for a new account.
async function isAcceptableEmail(email) {
  const domain = email.split('@')[1]
  if (!domain || isDisposable(domain)) return false
  return receivesMail(domain)
}

module.exports = { isAcceptableEmail }
