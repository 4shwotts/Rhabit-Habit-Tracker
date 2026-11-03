// Runs before every frontend test file.
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  // unmount anything a test rendered, and put real timers and mocks back
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})
