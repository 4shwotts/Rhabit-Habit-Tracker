// Request validation built on zod. Every route declares the exact shape of its
// body and params; anything else (wrong types, out-of-range values, unknown
// fields) is rejected before the handler runs.
const { z } = require('zod')

// Largest value a Postgres INTEGER can hold — anything bigger can't be an id.
const MAX_INT = 2147483647

// Route ids: a positive integer in the URL. Malformed ids get a 404, exactly
// like ids that don't exist or belong to someone else.
const idParam = z.coerce.number().int().positive().max(MAX_INT)

// Body for routes that take no input: must be empty (or absent).
const emptyBody = z.strictObject({})

// Reusable field schemas
const fields = {
  username: z.string().trim().min(1, 'Username must be between 1 and 30 characters')
    .max(30, 'Username must be between 1 and 30 characters'),
  // deliberately simple — the verification email is the real check
  email: z.string().trim().toLowerCase().max(254, 'Enter a valid email address')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'),
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected
  // rather than silently truncated
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  // existing password (login / delete): no policy hints, just a sane length cap
  password: z.string().max(200),
  token: z.string().min(20).max(200),
  goalName: z.string().trim().min(1, 'Goal name must be between 1 and 50 characters')
    .max(50, 'Goal name must be between 1 and 50 characters'),
  level: z.number().int().min(1).max(10),
  taskTitle: z.string().max(40, 'Task titles must be at most 40 characters')
}

// Builds middleware that validates req.params and req.body against the given
// strict schemas and replaces them with the parsed (trimmed, typed) values.
// `invalidBodyStatus` / `invalidBodyMessage` let auth routes return a generic
// error instead of revealing which field failed.
function validate({ params, body = emptyBody, invalidBodyStatus = 400, invalidBodyMessage } = {}) {
  return (req, res, next) => {
    if (params) {
      const parsed = params.safeParse(req.params)
      if (!parsed.success) return res.status(404).json({ error: 'Not found' })
      Object.assign(req.params, parsed.data)
    }

    const parsedBody = body.safeParse(req.body ?? {})
    if (!parsedBody.success) {
      const message = invalidBodyMessage || parsedBody.error.issues[0]?.message || 'Invalid request'
      return res.status(invalidBodyStatus).json({ error: message })
    }
    req.body = parsedBody.data
    next()
  }
}

module.exports = { z, validate, idParam, emptyBody, fields }
