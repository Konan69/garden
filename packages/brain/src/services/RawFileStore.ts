import { FileSystem } from 'effect/FileSystem'
import { Context, Effect, Layer } from 'effect'
import { HelixError } from '../errors.ts'

export type ReadRange = {
  readonly start: number
  readonly end: number
}

export type RawFileStoreShape = {
  readonly read: (
    key: string,
    range?: ReadRange,
  ) => Effect.Effect<Uint8Array, HelixError>
}

export class RawFileStore extends Context.Service<
  RawFileStore,
  RawFileStoreShape
>()('@garden/brain/RawFileStore') {}

const slice = (bytes: Uint8Array, range: ReadRange | undefined) => {
  if (range === undefined) return bytes
  const start = Math.max(0, range.start)
  const end = Math.min(bytes.length, range.end + 1)
  if (start >= end) return new Uint8Array(0)
  return bytes.slice(start, end)
}

export const LocalRawFileStoreLive: Layer.Layer<
  RawFileStore,
  never,
  FileSystem
> = Layer.effect(
  RawFileStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    return RawFileStore.of({
      read: (key, range) =>
        fs.readFile(key).pipe(
          Effect.map((bytes) => slice(bytes, range)),
          Effect.mapError(
            (cause) =>
              new HelixError({ message: `failed to read raw file ${key}`, cause }),
          ),
        ),
    })
  }),
)

export type R2BucketLike = {
  readonly get: (
    key: string,
    options?: { readonly range?: { readonly offset: number; readonly length: number } },
  ) => Promise<{ readonly arrayBuffer: () => Promise<ArrayBuffer> } | null>
}

export function makeR2RawFileStoreLive(bucket: R2BucketLike): Layer.Layer<RawFileStore> {
  return Layer.succeed(
    RawFileStore,
    RawFileStore.of({
      read: (key, range) =>
        Effect.tryPromise({
          try: async () => {
            const object =
              range === undefined
                ? await bucket.get(key)
                : await bucket.get(key, {
                    range: {
                      offset: range.start,
                      length: range.end - range.start + 1,
                    },
                  })
            if (object === null) {
              throw new Error(`raw file not found: ${key}`)
            }
            return new Uint8Array(await object.arrayBuffer())
          },
          catch: (cause) =>
            new HelixError({ message: `failed to read raw file ${key}`, cause }),
        }),
    }),
  )
}
