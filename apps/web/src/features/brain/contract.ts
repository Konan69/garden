import { z } from 'zod'

export const BrainFileStatusSchema = z.enum(['processing', 'ready', 'failed'])

export const BrainFileSummarySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().min(1),
    status: BrainFileStatusSchema,
  })
  .strict()

export const BrainFileResponseSchema = z
  .object({ item: BrainFileSummarySchema })
  .strict()

export const BrainFileListResponseSchema = z
  .object({ items: z.array(BrainFileSummarySchema) })
  .strict()

export const BrainFileIdSchema = z.string().trim().min(1)

export type BrainFileStatus = z.infer<typeof BrainFileStatusSchema>
export type BrainFileSummary = z.infer<typeof BrainFileSummarySchema>

/** Maps persisted indexing fields to the public file status. */
export function brainFileStatusOf(item: {
  indexed: boolean
  indexStatus?: BrainFileStatus
}): BrainFileStatus {
  return item.indexStatus ?? (item.indexed ? 'ready' : 'processing')
}
