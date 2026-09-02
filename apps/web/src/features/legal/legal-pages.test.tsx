import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './privacy-page'
import { TermsPage } from './terms-page'

describe('public legal pages', () => {
  it('renders the privacy notice with data and rights disclosures', () => {
    render(<PrivacyPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '2. Information we collect' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '10. Your rights and choices' }),
    ).toBeInTheDocument()
  })

  it('renders the service terms and links back to privacy', () => {
    render(<TermsPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'Privacy Policy' })[0],
    ).toHaveAttribute('href', '/privacy')
  })
})
