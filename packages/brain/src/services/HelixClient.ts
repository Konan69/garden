import { Context, Effect, Layer, Schema } from 'effect'
import {
  HttpBody,
  HttpClient,
  HttpClientRequest,
} from 'effect/unstable/http'
import { FetchHttpClient } from 'effect/unstable/http'
import { parseJson } from '@helix-db/helix-db'
import type { QueryRequest } from '@helix-db/helix-db'
import { HelixError, WriteConflict } from '../errors.ts'

const QueryResponseSchema = Schema.Record(Schema.String, Schema.Unknown)
export type QueryResponse = typeof QueryResponseSchema.Type

const PLANNER_ERROR = 'unsupported cascades plan'

export type RunOptions = {
  readonly awaitDurability?: boolean
}

export type HelixClientShape = {
  readonly run: (
    request: QueryRequest,
    options?: RunOptions,
  ) => Effect.Effect<QueryResponse, HelixError | WriteConflict>
}

export class HelixClient extends Context.Service<
  HelixClient,
  HelixClientShape
>()('@garden/brain/HelixClient') {}

const isPlannerError = (error: HelixError | WriteConflict): boolean =>
  error instanceof HelixError &&
  error.status === 400 &&
  error.message.includes(PLANNER_ERROR)

const runOnce = (
  baseUrl: string,
  apiKey: string | undefined,
  http: HttpClient.HttpClient,
  request: QueryRequest,
  options: RunOptions | undefined,
) =>
  Effect.gen(function* () {
    const headers: Record<string, string> = {}
    if (apiKey !== undefined) headers['authorization'] = `Bearer ${apiKey}`
    if (options?.awaitDurability === true) {
      headers['x-helix-await-durable'] = 'true'
    }
    const response = yield* http.execute(
      HttpClientRequest.post(new URL('/v2/query', baseUrl).toString(), {
        body: HttpBody.uint8Array(request.toJsonBytes(), 'application/json'),
        headers,
      }),
    )
    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(
        Effect.catch(() => Effect.succeed('')),
      )
      const message = `helix query failed (${response.status}): ${body.slice(0, 1000)}`
      return yield* Effect.fail(
        response.status === 409
          ? new WriteConflict({ message })
          : new HelixError({ message, status: response.status }),
      )
    }
    const text = yield* response.text
    const parsed = parseJson(text)
    return yield* Schema.decodeUnknownEffect(QueryResponseSchema)(parsed)
  }).pipe(
    Effect.mapError((error) =>
      error instanceof HelixError || error instanceof WriteConflict
        ? error
        : new HelixError({ message: 'helix request failed', cause: error }),
    ),
  )

const runWithRetry = (
  baseUrl: string,
  apiKey: string | undefined,
  http: HttpClient.HttpClient,
  request: QueryRequest,
  options: RunOptions | undefined,
) =>
  Effect.retry(runOnce(baseUrl, apiKey, http, request, options), {
    times: 1,
    while: isPlannerError,
  })

export type HelixClientConfigShape = {
  readonly baseUrl: string
  readonly apiKey?: string
}

const makeHelixClient = Effect.gen(function* () {
  const config = yield* HelixClientConfig
  const http = yield* HttpClient.HttpClient
  return HelixClient.of({
    run: (request, options) =>
      runWithRetry(config.baseUrl, config.apiKey, http, request, options),
  })
})

export class HelixClientConfig extends Context.Service<
  HelixClientConfigShape,
  HelixClientConfigShape
>()('@garden/brain/HelixClientConfig') {}

export const HelixClientLive: Layer.Layer<
  HelixClient,
  never,
  HelixClientConfigShape | HttpClient.HttpClient
> = Layer.effect(HelixClient, makeHelixClient)

export function makeHelixClientLayer(args: {
  baseUrl: string
  apiKey?: string
  fetch?: typeof globalThis.fetch
}) {
  const configLayer = Layer.succeed(HelixClientConfig)({
    baseUrl: args.baseUrl,
    ...(args.apiKey === undefined ? {} : { apiKey: args.apiKey }),
  })
  const httpLayer = args.fetch
    ? FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(args.fetch)),
      )
    : FetchHttpClient.layer
  return HelixClientLive.pipe(
    Layer.provide(configLayer),
    Layer.provide(httpLayer),
  )
}
