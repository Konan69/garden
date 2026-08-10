// @vitest-environment node
import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { getPooledDb } from '@garden/db/runtime'
import { schema } from '@garden/db'
import { createBetterAuth } from '@/lib/auth/instance'

it('seeds a dev session', async () => {
  const DATABASE_URL = process.env.DATABASE_URL!
  const db = getPooledDb(DATABASE_URL)

  const email = `spike-${Date.now()}@garden.dev`
  const password = 'spike-pass-123'
  const name = 'Spike User'

  const env = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: 'http://localhost:3000',
    DATABASE_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? '',
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID ?? '',
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ?? '',
    RESEND_API_KEY: 'seed-dummy',
    EXA_API_KEY: 'seed-dummy',
    ENVIRONMENT: 'development',
    VITE_PUBLIC_POSTHOG_HOST: 'http://localhost',
    VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: 'dummy',
    request: new Request('http://localhost:3000/api/auth'),
  }

  const auth = createBetterAuth(db, env)

  const signUp = await auth.api.signUpEmail({
    body: { email, password, name },
    asResponse: true,
  })
  const cookies = signUp.headers.getSetCookie()
  const sessionCookie = cookies.find((c) => c.includes('session_token'))!
  const cookieValue = sessionCookie.split(';')[0]

  const [user] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))

  const [org] = await db
    .insert(schema.organization)
    .values({ name: 'Spike Workspace', slug: `spike-${Date.now()}` })
    .returning({ id: schema.organization.id })

  await db.insert(schema.member).values({
    organizationId: org.id,
    userId: user.id,
    role: 'owner',
  })

  await db
    .update(schema.session)
    .set({ activeOrganizationId: org.id })
    .where(eq(schema.session.userId, user.id))

  writeFileSync(
    '/tmp/garden_seed.json',
    JSON.stringify({ cookie: cookieValue, workspaceId: org.id, email, password }),
  )
})
