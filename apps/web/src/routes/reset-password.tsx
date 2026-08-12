import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordPage } from '@/features/auth'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token, error } = Route.useSearch()
  return <ResetPasswordPage token={token} invalidToken={Boolean(error)} />
}
