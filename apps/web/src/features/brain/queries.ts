import { queryOptions } from '@tanstack/react-query'
import { getBrainFile, type BrainFileStatus } from './api'

const FILE_STATUS_POLL_INTERVAL_MS = 2_000

export const brainFileKeys = {
  all: ['brain', 'files'] as const,
  detail: (id: string) => [...brainFileKeys.all, id] as const,
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
