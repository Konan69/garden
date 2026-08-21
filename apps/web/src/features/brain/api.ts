import { getApiTransport } from '@/lib/api/state'

export type BrainFileStatus = 'processing' | 'ready'

export interface BrainFileSummary {
  id: string
  name: string
  status: BrainFileStatus
}

interface BrainFileResponse {
  item: BrainFileSummary
}

export async function uploadBrainFile(file: File): Promise<BrainFileSummary> {
  const formData = new FormData()
  formData.set('file', file)

  const response = await getApiTransport().requestForm<BrainFileResponse>(
    '/api/brain/files',
    formData,
  )

  return response.item
}

export async function getBrainFile(id: string): Promise<BrainFileSummary> {
  const response = await getApiTransport().request<BrainFileResponse>(
    `/api/brain/files/${encodeURIComponent(id)}`,
  )

  return response.item
}
