// Symmetric encryption for secrets stored in the database (authenticator-app
// TOTP secrets). AES-256-GCM: authenticated, so tampered ciphertext fails to
// decrypt instead of producing garbage. The key comes from TOTP_ENCRYPTION_KEY,
// kept separate from JWT_SECRET so rotating one doesn't break the other.
const crypto = require('crypto')
const config = require('../config')

// any length of key material in, exactly 32 bytes out
const key = crypto.createHash('sha256').update(config.totpEncryptionKey).digest()
const IV_BYTES = 12
const TAG_BYTES = 16

// returns base64url(iv | auth tag | ciphertext)
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decrypt(encoded) {
  const data = Buffer.from(encoded, 'base64url')
  const iv = data.subarray(0, IV_BYTES)
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = data.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
