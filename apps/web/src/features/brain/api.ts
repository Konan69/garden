import { getApiTransport } from '@/lib/api/state'

export type BrainFileStatus = 'processing' | 'ready'

export interface BrainFileSummary {
  id: string
  name: string
  status: BrainFileStatus
}

interface UploadBrainFileResponse {
  item: BrainFileSummary
}

export async function uploadBrainFile(file: File): Promise<BrainFileSummary> {
  const formData = new FormData()
  formData.set('file', file)

  const response = await getApiTransport().requestForm<UploadBrainFileResponse>(
    '/api/brain/files',
    formData,
  )

  return response.item
}
