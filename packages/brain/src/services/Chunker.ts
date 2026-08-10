import { Context, Effect, Layer } from 'effect'
import type { ExtractedDoc, FileFormat } from './Extractor.ts'

export type Chunk = {
  readonly title: string
  readonly body: string
  readonly path?: string
}

export type ChunkOptions = {
  readonly size: number
  readonly overlap: number
}

const DEFAULT_OPTIONS: ChunkOptions = { size: 1000, overlap: 100 }

const headingInfo = (
  line: string,
): { readonly depth: number; readonly title: string } | null => {
  const match = line.match(/^(#{1,6})\s+(.*)$/)
  if (match === null) return null
  return { depth: match[1]!.length, title: (match[2] ?? '').trim() }
}

const breadcrumbBody = (path: string, body: string): string =>
  body === '' ? path : `${path}\n\n${body}`

export const splitHeadings = (
  body: string,
  options: ChunkOptions = DEFAULT_OPTIONS,
  rootTitle?: string,
): readonly Chunk[] => {
  const { size } = options
  const sections: { title: string; body: string; path: string }[] = []
  const chain: string[] = rootTitle === undefined ? [] : [rootTitle]
  let current: { title: string; body: string; path: string } | null = null
  for (const line of body.split('\n')) {
    const info = headingInfo(line)
    if (info !== null) {
      if (current !== null) sections.push(current)
      chain.length = info.depth
      chain[info.depth - 1] = info.title
      current = { title: info.title, body: '', path: chain.join(' > ') }
    } else if (current !== null) {
      current.body = current.body === '' ? line : `${current.body}\n${line}`
    }
  }
  if (current !== null) sections.push(current)
  return sections.flatMap((section) => {
    if (section.body.length <= size) {
      return [
        {
          title: section.title,
          body: breadcrumbBody(section.path, section.body),
          path: section.path,
        },
      ]
    }
    return chunkBySize(section.body, options).map((part, i) => ({
      title: i === 0 ? section.title : `${section.title} (${i + 1})`,
      body: breadcrumbBody(section.path, part.body),
      path: i === 0 ? section.path : `${section.path} (${i + 1})`,
    }))
  })
}

const chunkBody = (body: string): readonly string[] => {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
  return paragraphs
}

const wrapChunks = (parts: readonly string[]): readonly Chunk[] =>
  parts.map((part, i) => ({ title: `Part ${i + 1}`, body: part }))

const takeTail = (text: string, overlap: number): string => {
  const words = text.split(/\s+/)
  let tail = ''
  for (let i = words.length - 1; i >= 0 && tail.length < overlap; i--) {
    tail = `${words[i]} ${tail}`.trim()
  }
  return tail
}

export const chunkBySize = (
  body: string,
  options: ChunkOptions = DEFAULT_OPTIONS,
): readonly Chunk[] => {
  const { size, overlap } = options
  const paragraphs = chunkBody(body)
  const chunks: Chunk[] = []
  let current = ''
  const pushChunk = (text: string) => {
    if (text !== '')
      chunks.push({ title: `Part ${chunks.length + 1}`, body: text })
  }
  for (const paragraph of paragraphs) {
    let rest = paragraph
    while (
      current !== '' &&
      current.length + rest.length + 2 > size &&
      current.length < size
    ) {
      chunks.push({ title: `Part ${chunks.length + 1}`, body: current })
      current = takeTail(current, overlap)
    }
    if (current === '') {
      current = rest
    } else {
      current = `${current}\n\n${rest}`
    }
    while (current.length > size) {
      pushChunk(current.slice(0, size))
      current = takeTail(current, overlap)
    }
  }
  pushChunk(current)
  return chunks
}

const chunkStructured = (
  body: string,
  options: ChunkOptions = DEFAULT_OPTIONS,
  rootTitle?: string,
): readonly Chunk[] => {
  const chunks = splitHeadings(body, options, rootTitle)
  if (chunks.length > 0) return chunks
  return wrapChunks(chunkBody(body))
}

export const chunkForFormat = (
  format: FileFormat,
  body: string,
  options: ChunkOptions = DEFAULT_OPTIONS,
  rootTitle?: string,
): readonly Chunk[] => {
  switch (format) {
    case 'markdown':
    case 'docx':
    case 'xlsx':
      return chunkStructured(body, options, rootTitle)
    default:
      return chunkBySize(body, options)
  }
}

export type ChunkerShape = {
  readonly chunk: (
    doc: ExtractedDoc,
    options?: ChunkOptions,
  ) => Effect.Effect<readonly Chunk[], never>
}

export class Chunker extends Context.Service<
  Chunker,
  ChunkerShape
>()('@garden/brain/Chunker') {}

export const ChunkerLive = Layer.succeed(
  Chunker,
  Chunker.of({
    chunk: (doc, options) =>
      Effect.succeed(
        chunkForFormat(doc.format, doc.body, options, doc.title),
      ),
  }),
)
