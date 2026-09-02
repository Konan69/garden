import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from './auth'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('./state', () => ({
  getApiTransport: () => ({ request }),
}))

describe('logout', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(undefined)
  })

  it('sends valid empty JSON when signing out', async () => {
    await logout()

    expect(request).toHaveBeenCalledWith('/api/auth/sign-out', {
      method: 'POST',
      body: '{}',
    })
  })
})
