import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Result, TaggedError } from 'better-result'
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { BrandIcon } from '@garden/ui/components/common/brand-icon'
import { Button, buttonVariants } from '@garden/ui/components/ui/button'
import { Card, CardContent } from '@garden/ui/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@garden/ui/components/ui/field'
import { Input } from '@garden/ui/components/ui/input'
import { authClient } from '@/lib/auth/client'

class PasswordRecoveryError extends TaggedError('PasswordRecoveryError')<{
  message: string
}>() {}

type AuthResponse = {
  data?: unknown
  error?: { message?: string | null } | null
}

/**
 * Normalizes Better Auth's transport rejection and response-level error into a
 * single typed result. This keeps both recovery forms on one boundary match and
 * avoids divergent toast/form error behavior. Source: installed Better Auth
 * v1.6.26 request-password-reset and reset-password route implementations.
 */
async function runRecoveryRequest(request: Promise<AuthResponse>) {
  const response = await Result.tryPromise({
    try: () => request,
    catch: (cause) =>
      new PasswordRecoveryError({
        message:
          cause instanceof Error ? cause.message : 'Password recovery failed',
      }),
  })

  return response.andThen((value) =>
    value.error
      ? Result.err(
          new PasswordRecoveryError({
            message: value.error.message || 'Password recovery failed',
          }),
        )
      : Result.ok(value.data),
  )
}

export function RequestPasswordResetPage({
  initialEmail = '',
}: {
  initialEmail?: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  /** Requests a link without revealing whether the account exists. */
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    void runRecoveryRequest(
      authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    )
      .then((result) =>
        result.match({
          ok: () => {
            setSent(true)
            toast.success('Check your email for a reset link')
          },
          err: (requestError) => {
            setError(requestError.message)
            toast.error(requestError.message)
          },
        }),
      )
      .finally(() => setLoading(false))
  }

  return (
    <RecoveryShell
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent
          ? `If an account exists for ${email}, a reset link is on its way.`
          : 'Enter your account email and we’ll send a secure reset link.'
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setSent(false)}
          >
            Send another link
          </Button>
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ArrowRightIcon className="size-4" />
                )}
                {loading ? 'Sending link...' : 'Send reset link'}
              </Button>
            </Field>
            <BackToSignIn />
          </FieldGroup>
        </form>
      )}
    </RecoveryShell>
  )
}

export function ResetPasswordPage({
  token,
  invalidToken,
}: {
  token?: string
  invalidToken: boolean
}) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cannotReset = invalidToken || !token

  /** Validates matching passwords locally, then consumes the one-time token. */
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    if (password !== confirmation) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')
    void runRecoveryRequest(
      authClient.resetPassword({ newPassword: password, token }),
    )
      .then((result) =>
        result.match({
          ok: () => {
            toast.success('Password updated. Sign in with your new password.')
            void navigate({
              to: '/login',
              search: { redirect: undefined },
              replace: true,
            })
          },
          err: (requestError) => {
            setError(requestError.message)
            toast.error(requestError.message)
          },
        }),
      )
      .finally(() => setLoading(false))
  }

  return (
    <RecoveryShell
      title={cannotReset ? 'Reset link expired' : 'Choose a new password'}
      subtitle={
        cannotReset
          ? 'This reset link is invalid or has expired. Request a fresh link to continue.'
          : 'Use at least 8 characters. Your old password will stop working immediately.'
      }
    >
      {cannotReset ? (
        <div className="space-y-4">
          <Link
            to="/forgot-password"
            search={{ email: undefined }}
            className={buttonVariants({ className: 'w-full' })}
          >
            Request a new link
            <ArrowRightIcon className="size-4" />
          </Link>
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm new password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ArrowRightIcon className="size-4" />
                )}
                {loading ? 'Updating password...' : 'Update password'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
    </RecoveryShell>
  )
}

function RecoveryShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-md border-border/70 bg-background shadow-sm">
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="space-y-3">
            <div className="inline-flex size-9 items-center justify-center rounded-md border border-border/70 bg-muted/30 text-foreground">
              <BrandIcon className="size-4" noSpin />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </main>
  )
}

function BackToSignIn() {
  return (
    <FieldDescription className="text-center">
      <Link
        to="/login"
        search={{ redirect: undefined }}
        className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to sign in
      </Link>
    </FieldDescription>
  )
}
