// The sign-up page under both settings of the public sign-up switch. When it's
// off, the page keeps its design but the form is switched off and points to the
// demo. The API and session are replaced with stand-ins.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../api'
import * as auth from '../../auth/AuthContext'
import SignupPage from './SignupPage'

vi.mock('../../api', () => ({
  signup: vi.fn(), resendVerification: vi.fn(), getSignupToken: vi.fn()
}))
vi.mock('../../auth/AuthContext', () => ({ useAuth: vi.fn() }))

async function renderSignup(publicSignup) {
  auth.useAuth.mockReturnValue({ publicSignup })
  let view
  await act(async () => {
    view = render(<MemoryRouter><SignupPage /></MemoryRouter>)
  })
  return view
}

const fields = () => ['signup-username', 'signup-email', 'signup-password', 'signup-confirm']
  .map(id => document.getElementById(id))

beforeEach(() => {
  api.getSignupToken.mockResolvedValue('form-token')
})

describe('with public sign-up open', () => {
  it('works as normal: fields on, no closed note, form token fetched', async () => {
    await renderSignup(true)
    for (const field of fields()) expect(field.disabled).toBe(false)
    expect(screen.queryByText(/Sign-up is closed/)).toBeNull()
    expect(api.getSignupToken).toHaveBeenCalledTimes(1)
  })
})

describe('with public sign-up closed', () => {
  it('keeps the full page on show', async () => {
    await renderSignup(false)
    expect(screen.getByRole('heading', { name: 'NEW PLAYER' })).toBeTruthy()
    for (const field of fields()) expect(field).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Already registered? Log in' }).getAttribute('href')).toBe('/login')
  })

  it('disables every field and the button', async () => {
    await renderSignup(false)
    for (const field of fields()) expect(field.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Sign up' }).disabled).toBe(true)
  })

  it('says sign-up is closed and links to the demo', async () => {
    await renderSignup(false)
    expect(screen.getByRole('note').textContent).toBe('Sign-up is closed on the live site. Try the demo instead')
    expect(screen.getByRole('link', { name: 'Try the demo instead' }).getAttribute('href')).toBe('/demo')
  })

  it("doesn't ask the server for a form token it would refuse", async () => {
    await renderSignup(false)
    expect(api.getSignupToken).not.toHaveBeenCalled()
  })
})
