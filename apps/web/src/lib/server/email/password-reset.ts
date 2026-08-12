import { Resend } from 'resend'
import { createLogger } from '@garden/observability/console'
import type { AppEnv } from '@/lib/server/env'
import { renderPasswordResetEmailHtml } from '@/lib/server/email/password-reset-email'

type PasswordResetEmailEnv = Pick<AppEnv, 'RESEND_API_KEY'>

const PASSWORD_RESET_FROM_EMAIL = 'Garden <hello@garden.flowresearch.tech>'
const logger = createLogger('password-reset-email')

type PasswordResetEmailInput = {
  env: PasswordResetEmailEnv
  resetUrl: string
  user: {
    id: string
    email: string
    name: string
  }
}

/**
 * Delivers Better Auth's one-time reset URL through the same Resend account as
 * workspace invitations. Provider failures are surfaced back to Better Auth so
 * a request is never reported as delivered when Resend rejected it.
 */
export async function sendPasswordResetEmail({
  env,
  resetUrl,
  user,
}: PasswordResetEmailInput) {
  const apiKey = readRequiredEnv(env.RESEND_API_KEY, 'RESEND_API_KEY')
  const html = renderPasswordResetEmailHtml({
    recipientName: user.name.trim() || 'there',
    resetUrl,
  })
  const resend = new Resend(apiKey)
  const response = await resend.emails.send({
    from: PASSWORD_RESET_FROM_EMAIL,
    to: user.email,
    subject: 'Reset your Garden password',
    html,
    text: [
      `Hi ${user.name.trim() || 'there'},`,
      '',
      'Use this link to reset your Garden password:',
      resetUrl,
      '',
      'This link expires in one hour and can only be used once.',
      'If you did not request it, you can ignore this email.',
    ].join('\n'),
    tags: [{ name: 'kind', value: 'password_reset' }],
  })

  if (response.error) {
    logger.error('send_failed', {
      errorMessage: response.error.message,
      errorName: response.error.name,
      provider: 'resend',
      statusCode: response.error.statusCode ?? null,
      toDomain: user.email.split('@')[1]?.toLowerCase() ?? 'unknown',
      userId: user.id,
    })
    throw new Error(
      `Resend password reset email failed: ${response.error.name} ${response.error.statusCode ?? 'unknown'} ${response.error.message}`,
    )
  }
}

function readRequiredEnv(value: string | undefined, name: string) {
  const trimmed = value?.trim()
  if (!trimmed)
    throw new Error(`${name} is required to send password reset email`)
  return trimmed
}
