import { createFileRoute } from '@tanstack/react-router'
import { RequestPasswordResetPage } from '@/features/auth'

export const Route = createFileRoute('/forgot-password')({
  validateSearch: (search) => ({
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const { email } = Route.useSearch()
  return <RequestPasswordResetPage initialEmail={email} />
}
