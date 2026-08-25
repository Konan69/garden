import { queryOptions } from '@tanstack/react-query'
import {
  getBrainFile,
  getBrainFileText,
  getBrainFileBytes,
  getBrainFileExtractedText,
  listBrainFiles,
  type BrainFileStatus,
} from './api'

const FILE_STATUS_POLL_INTERVAL_MS = 2_000

export const brainFileKeys = {
  all: ['brain', 'files'] as const,
  list: () => [...brainFileKeys.all, 'list'] as const,
  detail: (id: string) => [...brainFileKeys.all, id] as const,
  content: (id: string) => [...brainFileKeys.detail(id), 'content'] as const,
  extractedText: (id: string) =>
    [...brainFileKeys.detail(id), 'extracted-text'] as const,
}

export function brainFileListOptions() {
  return queryOptions({
    queryKey: brainFileKeys.list(),
    queryFn: listBrainFiles,
    refetchOnWindowFocus: true,
  })
}

export function brainFileStatusOptions(
  id: string,
  initialStatus: BrainFileStatus,
) {
  return queryOptions({
    queryKey: brainFileKeys.detail(id),
    queryFn: () => getBrainFile(id),
    enabled: initialStatus === 'processing',
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false

      return query.state.data?.status === 'processing'
        ? FILE_STATUS_POLL_INTERVAL_MS
        : false
    },
    refetchOnWindowFocus: true,
  })
}

export function brainFileTextOptions(id: string) {
  return queryOptions({
    queryKey: brainFileKeys.content(id),
    queryFn: () => getBrainFileText(id),
    staleTime: Infinity,
  })
}

export function brainFileExtractedTextOptions(id: string) {
  return queryOptions({
    queryKey: brainFileKeys.extractedText(id),
    queryFn: () => getBrainFileExtractedText(id),
    staleTime: Infinity,
  })
}

/**
 * Loads the private PDF bytes and creates one cached PDF.js document.
 * Page previews reuse this document instead of downloading the file again.
 */
export function brainFilePdfOptions(id: string) {
  return queryOptions({
    queryKey: [...brainFileKeys.content(id), 'pdf'] as const,
    queryFn: async () => {
      const [bytes, pdfjs] = await Promise.all([
        getBrainFileBytes(id),
        import('pdfjs-dist'),
      ])

      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()

      return pdfjs.getDocument({ data: bytes }).promise
    },
    staleTime: Infinity,
  })
}
