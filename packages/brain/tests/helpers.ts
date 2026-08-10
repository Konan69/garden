import { NodeFileSystem } from '@effect/platform-node'
import { Layer } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import {
  HelixClientConfig,
  type HelixClientConfigShape,
} from '../src/services/HelixClient.ts'

export const TestConfig = Layer.succeed(HelixClientConfig)({
  baseUrl: 'http://localhost:6968',
})

export const withTestConfig = <R, E>(
  layer: Layer.Layer<R, E, FileSystem | HelixClientConfigShape>,
): Layer.Layer<R, E, never> =>
  Layer.provide(
    layer,
    Layer.merge(NodeFileSystem.layer, TestConfig),
  )
