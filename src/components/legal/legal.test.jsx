// The privacy notice and disclaimer: both render without anyone logged in,
// read correctly whether public sign-up is open or closed, and are linked from
// the login page, the sign-up page and Settings. The API and session are
// replaced with stand-ins.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as auth from '../../auth/AuthContext'
import PrivacyPage from './PrivacyPage'
import DisclaimerPage from './DisclaimerPage'
import LoginPage from '../auth/LoginPage'
import SignupPage from '../auth/SignupPage'
import SettingsModal from '../SettingsModal'

vi.mock('../../api', () => ({
  login: vi.fn(), verifyTwoFactor: vi.fn(), wakeServer: vi.fn(async () => ({ status: 'awake' })),
  signup: vi.fn(), resendVerification: vi.fn(),
  getSignupToken: vi.fn(async () => 'form-token'), deleteAccount: vi.fn(),
  startTwoFactorSetup: vi.fn(), enableTwoFactor: vi.fn(), disableTwoFactor: vi.fn()
}))
vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(), stageOf: vi.fn(() => 'guest'), pathForStage: vi.fn(() => '/login')
}))

// nobody logged in, unless a test says otherwise
function signedOut(publicSignup) {
  auth.useAuth.mockReturnValue({
    user: null, publicSignup, refresh: vi.fn(), startDemo: vi.fn(), logout: vi.fn(), setUser: vi.fn()
  })
}

async function renderPage(page) {
  let view
  await act(async () => { view = render(<MemoryRouter>{page}</MemoryRouter>) })
  return view
}

const text = view => view.container.textContent
const linkTo = (name, href) => {
  const link = screen.getByRole('link', { name })
  expect(link.getAttribute('href')).toBe(href)
}

beforeEach(() => signedOut(true))

describe('the privacy notice', () => {
  it('renders for a visitor who is not logged in', async () => {
    const view = await renderPage(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'PRIVACY NOTICE' })).toBeTruthy()
    expect(text(view)).toMatch(/demo/i)
  })

  it('covers what the code does: data, cookies, providers, how long, and deleting', async () => {
    const view = await renderPage(<PrivacyPage />)
    const t = text(view)
    for (const fact of [
      '.invalid', 'deleted after 24 hours', 'No emails are ever sent from a demo account',
      'one-way hash (bcrypt)', 'stored encrypted', 'stored only as hashes',
      'rhabit_session', 'rhabit_2fa', 'no cookie banner',
      'Vercel', 'Render', 'Neon', 'Brevo', 'outside the UK',
      'never saves IP addresses to its database', 'Delete account', 'End demo'
    ]) expect(t, fact).toContain(fact)
  })

  it('gives the contact email as a link', async () => {
    await renderPage(<PrivacyPage />)
    const links = screen.getAllByRole('link', { name: 'ulasatik04@gmail.com' })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute('href')).toBe('mailto:ulasatik04@gmail.com')
  })

  it.each([
    [true, /Public sign-up is currently open/],
    [false, /Public sign-up is closed on the live site/]
  ])('reads correctly with sign-up open: %s', async (open, sentence) => {
    signedOut(open)
    const view = await renderPage(<PrivacyPage />)
    expect(text(view)).toMatch(sentence)
  })

  it('links to the disclaimer', async () => {
    await renderPage(<PrivacyPage />)
    linkTo('Disclaimer', '/disclaimer')
  })
})

describe('the disclaimer', () => {
  it('renders for a visitor who is not logged in, and says it is provided as it is', async () => {
    const view = await renderPage(<DisclaimerPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'DISCLAIMER' })).toBeTruthy()
    expect(text(view)).toMatch(/portfolio project/)
    expect(text(view)).toMatch(/no guarantees/)
    expect(text(view)).toMatch(/Data may be reset or deleted at any time/)
  })

  it.each([
    [true, /Public sign-up is currently open/],
    [false, /Public sign-up is closed on the live site/]
  ])('reads correctly with sign-up open: %s', async (open, sentence) => {
    signedOut(open)
    const view = await renderPage(<DisclaimerPage />)
    expect(text(view)).toMatch(sentence)
  })

  it('links to the privacy notice', async () => {
    await renderPage(<DisclaimerPage />)
    linkTo('Privacy notice', '/privacy')
  })
})

describe('where they are linked from', () => {
  it('the login page, next to Try the demo', async () => {
    await renderPage(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeTruthy()
    linkTo('Privacy notice', '/privacy')
    linkTo('Disclaimer', '/disclaimer')
  })

  it.each([true, false])('the sign-up page, with sign-up open: %s', async open => {
    signedOut(open)
    await renderPage(<SignupPage />)
    linkTo('Privacy notice', '/privacy')
    linkTo('Disclaimer', '/disclaimer')
  })

  it.each([
    ['a full account', { is_demo: false }],
    ['a demo', { is_demo: true }]
  ])('Settings inside the app, for %s', async (_, user) => {
    auth.useAuth.mockReturnValue({ user, logout: vi.fn(), setUser: vi.fn(), publicSignup: true })
    await renderPage(<SettingsModal onClose={vi.fn()} settings={{}} onToggle={vi.fn()} />)
    linkTo('Privacy notice', '/privacy')
    linkTo('Disclaimer', '/disclaimer')
  })
})
