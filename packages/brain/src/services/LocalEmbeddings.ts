import { Effect, Layer, Ref } from 'effect'
import { env, pipeline } from '@xenova/transformers'
import type { FeatureExtractionPipeline } from '@xenova/transformers'
import { EMBEDDING_DIM, Embeddings } from './Embeddings.ts'
import { EmbedError } from '../errors.ts'

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

env.backends.onnx.wasm.proxy = false
env.backends.onnx.wasm.numThreads = 1

const buildPipeline = () =>
  Effect.tryPromise({
    try: () =>
      pipeline('feature-extraction', EMBEDDING_MODEL, { quantized: true }),
    catch: (cause) =>
      new EmbedError({ message: 'failed to load embedding model', cause }),
  })

const embedWithPipeline = (instance: FeatureExtractionPipeline, texts: readonly string[]) =>
  Effect.tryPromise({
    try: async () => {
      const tensor = await instance(texts as string[], {
        pooling: 'mean',
        normalize: true,
      })
      const data = tensor.data as Float32Array
      const dim = EMBEDDING_DIM
      const rows: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        rows.push(Array.from(data.slice(i * dim, (i + 1) * dim)))
      }
      return rows
    },
    catch: (cause) =>
      new EmbedError({ message: 'failed to embed texts', cause }),
  })

export const LocalEmbeddingsLive = Layer.effect(
  Embeddings,
  Effect.gen(function* () {
    const cache = yield* Ref.make<FeatureExtractionPipeline | null>(null)
    const getPipeline = Effect.flatMap(Ref.get(cache), (instance) =>
      instance === null
        ? buildPipeline().pipe(Effect.tap((built) => Ref.set(cache, built)))
        : Effect.succeed(instance),
    )
    return Embeddings.of({
      dim: EMBEDDING_DIM,
      embed: (texts) =>
        Effect.flatMap(getPipeline, (instance) =>
          embedWithPipeline(instance, texts),
        ),
    })
  }),
)

export const EmbeddingsLive = LocalEmbeddingsLive
