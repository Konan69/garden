import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPage } from '@/features/legal'

const PRIVACY_TITLE = 'Privacy Policy — Garden'
const PRIVACY_DESCRIPTION =
  'How Flow Research collects, uses, shares, retains, and protects information when you use Garden.'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: PRIVACY_TITLE },
      { name: 'description', content: PRIVACY_DESCRIPTION },
      { property: 'og:title', content: PRIVACY_TITLE },
      { property: 'og:description', content: PRIVACY_DESCRIPTION },
      { name: 'twitter:title', content: PRIVACY_TITLE },
      { name: 'twitter:description', content: PRIVACY_DESCRIPTION },
    ],
  }),
  component: PrivacyPage,
})
