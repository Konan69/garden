import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createWorkersAISpy } = vi.hoisted(() => ({
  createWorkersAISpy: vi.fn(),
}))

vi.mock('workers-ai-provider', () => ({
  createWorkersAI: createWorkersAISpy,
}))

import { createAgentModel } from './model'

describe('createAgentModel', () => {
  beforeEach(() => {
    createWorkersAISpy.mockReset()
    createWorkersAISpy.mockReturnValue(vi.fn(() => ({ id: 'model' })))
  })

  it('uses Workers AI directly when no gateway is configured', () => {
    const ai = {} as Ai

    createAgentModel({ ai })

    expect(createWorkersAISpy).toHaveBeenCalledWith({ binding: ai })
  })

  it('routes through the explicitly configured gateway', () => {
    const ai = {} as Ai

    createAgentModel({ ai, gatewayId: '  contributor-gateway  ' })

    expect(createWorkersAISpy).toHaveBeenCalledWith({
      binding: ai,
      gateway: { id: 'contributor-gateway' },
    })
  })
})
