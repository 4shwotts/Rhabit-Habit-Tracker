// Sends transactional email through Brevo's HTTPS API (Render's free tier blocks
// outbound SMTP, so nodemailer/Gmail won't work there).
// In development without BREVO_API_KEY, the email is printed to the console
// instead so the links can be clicked locally.
const config = require('../config')

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

// Escapes values interpolated into email HTML (usernames are user-controlled).
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Simple dark HUD-style wrapper so emails match the app.
function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#07070A;font-family:Arial,sans-serif;color:#FFFFFF;">
  <div style="max-width:520px;margin:0 auto;border:2px solid #916FF1;border-radius:24px;padding:32px;background:#120F1C;">
    <h1 style="margin:0 0 16px;color:#C1AAFF;font-size:24px;font-style:italic;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin-top:32px;font-size:12px;color:#A89BC2;">Rhabit — if you didn't expect this email, you can safely ignore it.</p>
  </div>
</body></html>`
}

function button(url, label) {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;border:2px solid #916FF1;border-radius:37px;background:rgba(145,111,241,0.3);color:#FFFFFF;text-decoration:none;font-size:18px;">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#A89BC2;word-break:break-all;">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`
}

async function sendEmail({ to, subject, html, text }) {
  if (!config.brevoApiKey) {
    // dev fallback — never reached in production (config.js refuses to start)
    console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n${text}\n`)
    return
  }

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': config.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: config.emailFromName, email: config.emailFrom },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  })

  if (!res.ok) {
    // log the status only — the response body may echo the recipient address
    throw new Error(`Brevo send failed with status ${res.status}`)
  }
}

function sendVerificationEmail(to, username, rawToken) {
  const url = `${config.appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`
  return sendEmail({
    to,
    subject: 'Verify your Rhabit account',
    html: layout(`Welcome, ${username}`, `
      <p>Confirm your email address to finish booting up your Rhabit account.</p>
      ${button(url, 'Verify email')}
      <p style="color:#A89BC2;">This link expires in 24 hours.</p>`),
    text: `Welcome, ${username}. Verify your Rhabit account: ${url}\nThis link expires in 24 hours.`
  })
}

function sendPasswordResetEmail(to, rawToken) {
  const url = `${config.appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`
  return sendEmail({
    to,
    subject: 'Reset your Rhabit password',
    html: layout('Password reset', `
      <p>Someone (hopefully you) asked to reset the password for this Rhabit account.</p>
      ${button(url, 'Choose a new password')}
      <p style="color:#A89BC2;">This link expires in 1 hour and can only be used once.</p>`),
    text: `Reset your Rhabit password: ${url}\nThis link expires in 1 hour and can only be used once.`
  })
}

// Sent when someone tries to sign up with an email that already has an account,
// so the signup response itself never has to reveal that.
function sendAccountExistsEmail(to) {
  const url = `${config.appUrl}/login`
  return sendEmail({
    to,
    subject: 'Sign-up attempt on your Rhabit account',
    html: layout('You already have an account', `
      <p>Someone tried to create a Rhabit account with this email address, but one already exists.</p>
      <p>If that was you, just log in — or reset your password if you've forgotten it.</p>
      ${button(url, 'Log in')}`),
    text: `Someone tried to sign up with this email, but you already have a Rhabit account. Log in: ${url}`
  })
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendAccountExistsEmail }
