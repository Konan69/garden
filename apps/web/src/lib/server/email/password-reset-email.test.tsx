import { describe, expect, it } from 'vitest'
import { renderPasswordResetEmailHtml } from './password-reset-email'

describe('renderPasswordResetEmailHtml', () => {
  it('renders the one-time reset URL and escapes user content', () => {
    const html = renderPasswordResetEmailHtml({
      recipientName: '<Ada>',
      resetUrl: 'https://garden.example/reset?token=a&next=b',
    })

    expect(html).toContain('Choose new password')
    expect(html).toContain('&lt;Ada&gt;')
    expect(html).toContain('https://garden.example/reset?token=a&amp;next=b')
    expect(html).not.toContain('<Ada>')
  })
})
