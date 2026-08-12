export type PasswordResetEmailProps = {
  resetUrl: string
  recipientName: string
}

const colors = {
  parchment: '#f2f0eb',
  vellum: '#fbfaf6',
  ink: '#263029',
  gravel: '#756f66',
  slate: '#999187',
  hairline: '#d9d3ca',
  brand: '#4d9864',
  sageWash: '#dcebdd',
  peachWash: '#efe2d2',
  duskWash: '#e9dde5',
}

/**
 * Renders a Worker-safe password reset email in Garden's existing letter-like
 * email system. The one-hour lifetime mirrors Better Auth's configured token
 * lifetime; explicit HTML avoids the Node-only react-email rendering path.
 */
export function renderPasswordResetEmailHtml(props: PasswordResetEmailProps) {
  const safe = {
    recipientName: escapeHtml(props.recipientName),
    resetUrl: escapeHtml(props.resetUrl),
    resetHref: escapeAttribute(props.resetUrl),
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Reset your Garden password</title>
    <style>
      @media (max-width: 640px) {
        .garden-frame { padding: 22px 14px !important; }
        .garden-panel { padding: 30px 22px 26px !important; }
        .garden-title { font-size: 30px !important; line-height: 35px !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:${colors.parchment};color:${colors.ink};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Reset your Garden password. This link expires in one hour.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${colors.parchment};background-image:radial-gradient(circle at 16% 12%, ${colors.sageWash} 0, transparent 34%), radial-gradient(circle at 86% 20%, ${colors.duskWash} 0, transparent 30%), radial-gradient(circle at 22% 92%, ${colors.peachWash} 0, transparent 32%);">
      <tr>
        <td align="center" class="garden-frame" style="padding:38px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
            <tr>
              <td align="center" style="padding:0 0 16px;">
                <div style="color:${colors.ink};font-size:15px;font-weight:600;letter-spacing:-0.01em;line-height:20px;">Garden</div>
                <div style="margin-top:3px;color:${colors.slate};font-size:10px;font-weight:600;letter-spacing:0.18em;line-height:14px;text-transform:uppercase;">Account security</div>
              </td>
            </tr>
            <tr>
              <td align="center" class="garden-panel" style="background:${colors.vellum};border:1px solid ${colors.hairline};border-radius:18px;padding:40px 38px 32px;">
                <h1 class="garden-title" style="margin:0 auto;color:${colors.ink};font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:36px;font-weight:300;letter-spacing:-0.02em;line-height:41px;text-align:center;">
                  Reset your password
                </h1>
                <p style="max-width:390px;margin:16px auto 0;color:${colors.gravel};font-size:15px;line-height:24px;text-align:center;">
                  Hi ${safe.recipientName}, use the secure link below to choose a new Garden password.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:30px auto 34px;">
                  <tr>
                    <td bgcolor="${colors.ink}" style="border:1px solid ${colors.ink};border-radius:10px;">
                      <a href="${safe.resetHref}" style="display:inline-block;color:${colors.parchment};font-size:14px;font-weight:600;line-height:18px;padding:12px 18px;text-decoration:none;">
                        Choose new password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;color:${colors.gravel};font-size:13px;line-height:21px;text-align:center;">
                  This link expires in one hour and can only be used once. If you didn’t request it, you can safely ignore this email.
                </p>
                <p style="max-width:410px;margin:20px auto 0;padding-top:20px;border-top:1px solid ${colors.hairline};color:${colors.gravel};font-size:12px;line-height:19px;text-align:center;">
                  Button not working? Paste this link:<br />
                  <a href="${safe.resetHref}" style="color:${colors.brand};text-decoration:underline;word-break:break-all;">${safe.resetUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:14px 24px 0;color:${colors.slate};font-size:11px;line-height:17px;text-align:center;">
                Garden is a workspace for tending agents, issues, and active work.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Escapes user-controlled text nodes before interpolating email markup. */
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Escapes the reset URL and strips control characters from its attribute. */
function escapeAttribute(value: string) {
  return Array.from(escapeHtml(value))
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
}
