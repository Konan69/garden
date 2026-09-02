import { describe, expect, it } from 'vitest'
import { generateText } from 'ai'
import { createAgentModel } from './model'

/**
 * Live integration check for the offline model seam: real generateText via
 * the OpenAI-compatible provider against a local Ollama. Skipped unless
 * GARDEN_ITEST_OLLAMA=1 (needs Ollama on 11434 with the model pulled), so CI
 * and normal test runs are unaffected.
 */
describe.skipIf(process.env.GARDEN_ITEST_OLLAMA !== '1')(
  'createAgentModel offline integration',
  () => {
    it('completes a real generation against local Ollama', async () => {
      const model = createAgentModel({
        ai: {} as Ai,
        env: {
          GARDEN_OFFLINE: '1',
          GARDEN_MODEL_ID: process.env.GARDEN_ITEST_MODEL ?? 'llama3.1:8b',
        },
      })

      const result = await generateText({
        model,
        prompt: 'Reply with the single word: bloom',
      })

      expect(result.text.toLowerCase()).toContain('bloom')
      expect(result.usage.outputTokens).toBeGreaterThan(0)
    }, 120_000)
  },
)
