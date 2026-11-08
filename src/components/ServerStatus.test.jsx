// Waiting for a sleeping server, with a fake clock: the waking message appears
// after 2 seconds (not before), a request that never answers gives up after the
// timeout with a friendly message, and Retry tries again. Covers the API
// client, the login page, the /demo page and the start-up screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ---------- the API client, with fetch replaced ----------

describe('the API client', () => {
  let api
  beforeEach(async () => {
    vi.useFakeTimers()
    api = await vi.importActual('../api')
  })
  afterEach(() => vi.unstubAllGlobals())

  // a fetch that never answers, but stops when its request is aborted
  const hangingFetch = () => vi.fn((url, options) => new Promise((_, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))

  it('gives up after the timeout with a friendly message, and says so', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    let result = null
    api.login('player@example.com', 'secret-password').then(r => { result = r })

    await act(() => vi.advanceTimersByTimeAsync(api.SERVER_TIMEOUT_MS - 1))
    expect(result).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result).toEqual({ error: "Couldn't reach the server, please try again.", unreachable: true })
  })

  it('treats no connection as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await api.startDemo('UTC')).toEqual({ error: "Couldn't reach the server, please try again.", unreachable: true })
  })

  it("treats the proxy's own error page (not JSON) as unreachable", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })))
    expect((await api.login('a@example.com', 'x')).unreachable).toBe(true)
  })

  it('passes the server\'s own errors through, without a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: 'The demo is busy right now. Please try again shortly.' }, { status: 503 }
    )))
    const result = await api.startDemo('UTC')
    expect(result.error).toBe('The demo is busy right now. Please try again shortly.')
    expect(result.unreachable).toBeUndefined()
  })
})

// ---------- the pages, with the API and session replaced ----------

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal()),
  login: vi.fn(), verifyTwoFactor: vi.fn(), wakeServer: vi.fn(async () => ({ status: 'awake' }))
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(), stageOf: vi.fn(user => (user ? 'app' : 'guest')),
  pathForStage: vi.fn(stage => (stage === 'app' ? '/home' : '/login'))
}))

const api = await import('../api')
const auth = await import('../auth/AuthContext')
const { default: LoginPage } = await import('./auth/LoginPage')
const { default: DemoStartPage } = await import('./auth/DemoStartPage')
const { default: BootScreen } = await import('./BootScreen')

// a promise the test resolves when it chooses, like a server taking its time
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

const UNREACHABLE = { error: "Couldn't reach the server, please try again.", unreachable: true }
const DEMO_USER = { id: 1, is_demo: true, email_verified: true, setup_complete: true }
const wait = ms => act(() => vi.advanceTimersByTimeAsync(ms))
const waking = () => screen.queryByText('Waking the server — this can take up to a minute')
const retryButton = () => screen.queryByRole('button', { name: 'Retry' })

async function renderAt(path) {
  let view
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/demo" element={<DemoStartPage />} />
          <Route path="/home" element={<p>HOME PAGE</p>} />
        </Routes>
      </MemoryRouter>
    )
  })
  return view
}

describe('the login page', () => {
  let startDemo
  beforeEach(() => {
    vi.useFakeTimers()
    startDemo = vi.fn()
    auth.useAuth.mockReturnValue({ user: null, refresh: vi.fn(async () => DEMO_USER), startDemo, publicSignup: true })
  })

  it('starts the server waking as soon as it loads', async () => {
    await renderAt('/login')
    expect(api.wakeServer).toHaveBeenCalledTimes(1)
  })

  it('shows the waking message only once Try the demo has taken 2 seconds', async () => {
    const slow = deferred()
    startDemo.mockReturnValueOnce(slow.promise)
    await renderAt('/login')
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))

    await wait(1999)
    expect(waking()).toBeNull()
    await wait(1)
    expect(waking()).not.toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Waking the server/)

    await act(async () => slow.resolve({ user: DEMO_USER }))
    expect(screen.getByText('HOME PAGE')).toBeTruthy()
  })

  it('never shows it for a quick answer', async () => {
    startDemo.mockResolvedValueOnce({ user: DEMO_USER })
    await renderAt('/login')
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))
    await wait(3000)
    expect(waking()).toBeNull()
  })

  it('offers Retry when the server cannot be reached, and Retry tries the demo again', async () => {
    const slow = deferred()
    startDemo.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ user: DEMO_USER })
    await renderAt('/login')
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))
    await wait(2000)
    await act(async () => slow.resolve(UNREACHABLE))

    expect(waking()).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch("Couldn't reach the server, please try again.")
    await act(async () => fireEvent.click(retryButton()))
    expect(startDemo).toHaveBeenCalledTimes(2)
    expect(screen.getByText('HOME PAGE')).toBeTruthy()
  })

  it('does the same for logging in, retrying with the same details', async () => {
    const slow = deferred()
    api.login.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ success: true })
    await renderAt('/login')
    fireEvent.change(document.getElementById('login-email'), { target: { value: 'player@example.com' } })
    fireEvent.change(document.getElementById('login-password'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await wait(2000)
    expect(waking()).not.toBeNull()
    await act(async () => slow.resolve(UNREACHABLE))
    expect(retryButton()).not.toBeNull()

    await act(async () => fireEvent.click(retryButton()))
    expect(api.login).toHaveBeenCalledTimes(2)
    expect(api.login).toHaveBeenLastCalledWith('player@example.com', 'secret-password')
    expect(screen.getByText('HOME PAGE')).toBeTruthy()
  })

  it("shows the server's own errors as before, without Retry", async () => {
    api.login.mockResolvedValueOnce({ error: 'Invalid email or password' })
    await renderAt('/login')
    fireEvent.change(document.getElementById('login-email'), { target: { value: 'player@example.com' } })
    fireEvent.change(document.getElementById('login-password'), { target: { value: 'wrong' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log in' })))
    expect(screen.getByRole('alert').textContent).toBe('Invalid email or password')
    expect(retryButton()).toBeNull()
  })
})

describe('the /demo page', () => {
  let startDemo
  beforeEach(() => {
    vi.useFakeTimers()
    startDemo = vi.fn()
    auth.useAuth.mockReturnValue({ user: null, startDemo, publicSignup: true })
  })

  it('shows the waking message after 2 seconds, then Retry if the server cannot be reached', async () => {
    const slow = deferred()
    startDemo.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ user: DEMO_USER })
    await renderAt('/demo')
    expect(waking()).toBeNull()
    await wait(2000)
    expect(waking()).not.toBeNull()

    await act(async () => slow.resolve(UNREACHABLE))
    expect(screen.getByRole('alert').textContent).toMatch("Couldn't reach the server")
    await act(async () => fireEvent.click(retryButton()))
    expect(startDemo).toHaveBeenCalledTimes(2)
    expect(screen.getByText('HOME PAGE')).toBeTruthy()
  })
})

describe('the start-up screen', () => {
  beforeEach(() => vi.useFakeTimers())

  it('adds the waking message if the first check takes 2 seconds', async () => {
    await act(async () => { render(<BootScreen />) })
    expect(screen.getByText('BOOTING SYSTEM...')).toBeTruthy()
    expect(waking()).toBeNull()
    await wait(2000)
    expect(waking()).not.toBeNull()
  })
})
