import { createFileRoute } from '@tanstack/react-router'
import { TermsPage } from '@/features/legal'

const TERMS_TITLE = 'Terms of Service — Garden'
const TERMS_DESCRIPTION =
  'Terms governing use of Garden’s hosted workspace, AI agents, automations, and connected tools.'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: TERMS_TITLE },
      { name: 'description', content: TERMS_DESCRIPTION },
      { property: 'og:title', content: TERMS_TITLE },
      { property: 'og:description', content: TERMS_DESCRIPTION },
      { name: 'twitter:title', content: TERMS_TITLE },
      { name: 'twitter:description', content: TERMS_DESCRIPTION },
    ],
  }),
  component: TermsPage,
})
