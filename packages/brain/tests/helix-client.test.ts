import { Effect } from 'effect'
import { expect, it } from '@effect/vitest'
import { g, readBatch } from '@helix-db/helix-db'
import {
  HelixClient,
  makeHelixClientLayer,
} from '../src/services/HelixClient.ts'

it.effect('preserves a Helix base URL path prefix', () => {
  let requestedUrl: string | undefined
  const fetch: typeof globalThis.fetch = async (input) => {
    requestedUrl =
      input instanceof Request
        ? input.url
        : new URL(input.toString()).toString()
    return Response.json({})
  }
  const request = readBatch()
    .varAs('count', g().n([]).count())
    .returning(['count'])
    .toQueryRequest({ queryName: 'test.path_prefix' })

  return Effect.gen(function* () {
    const helix = yield* HelixClient
    yield* helix.run(request)
    expect(requestedUrl).toBe(
      'https://helix.example.com/gateway/tenant/v2/query',
    )
  }).pipe(
    Effect.provide(
      makeHelixClientLayer({
        baseUrl:
          'https://helix.example.com/gateway/tenant?source=test#fragment',
        fetch,
      }),
    ),
  )
})
