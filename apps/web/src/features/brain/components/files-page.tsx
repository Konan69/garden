import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileText, Loader2 } from 'lucide-react'
import { uploadBrainFile, type BrainFileSummary } from '../api'
import {
  brainFileKeys,
  brainFileListOptions,
  brainFileStatusOptions,
} from '../queries'
import { BrainFilePreviewDialog } from './file-preview-dialog'

const ACCEPTED_FILE_TYPES = '.txt,.md,.pdf,.docx,.xlsx'

function BrainFileCard({
  onPreview,
  uploadedFile,
}: {
  onPreview: (file: BrainFileSummary) => void
  uploadedFile: BrainFileSummary
}) {
  const statusQuery = useQuery(
    brainFileStatusOptions(uploadedFile.id, uploadedFile.status),
  )
  const file = statusQuery.data ?? uploadedFile
  const canPreview = file.status === 'ready' && !statusQuery.isError

  return (
    <li className="flex min-h-[7.125rem] w-full flex-col justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 sm:w-[11.625rem]">
      <button
        type="button"
        disabled={!canPreview}
        onClick={() => onPreview(file)}
        aria-label={`Preview ${file.name}`}
        className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-left disabled:cursor-default"
      >
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />

        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {file.name}
        </span>
      </button>

      {statusQuery.isError ? (
        <div className="mt-3 text-xs">
          <p role="alert" className="text-destructive">
            Could not check file status.
          </p>

          <button
            type="button"
            className="mt-1 font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => void statusQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          {file.status === 'processing' ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : null}

          {file.status === 'ready' ? 'Ready' : 'Processing'}
        </p>
      )}
    </li>
  )
}

export function BrainFilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewFile, setPreviewFile] = useState<BrainFileSummary | null>(null)
  const queryClient = useQueryClient()
  const filesQuery = useQuery(brainFileListOptions())
  const files = filesQuery.data ?? []

  const uploadMutation = useMutation({
    mutationFn: uploadBrainFile,
    onSuccess: (uploadedFile) => {
      queryClient.setQueryData<BrainFileSummary[]>(
        brainFileKeys.list(),
        (currentFiles = []) => [
          uploadedFile,
          ...currentFiles.filter((file) => file.id !== uploadedFile.id),
        ],
      )
    },
  })

  const startUpload = (file: File | undefined) => {
    if (file === undefined || uploadMutation.isPending) return
    uploadMutation.mutate(file)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    startUpload(file)
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    startUpload(event.dataTransfer.files[0])
  }

  const uploadError =
    uploadMutation.error instanceof Error
      ? uploadMutation.error.message
      : uploadMutation.error
        ? 'The file could not be uploaded.'
        : null

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="w-full px-6 py-10 sm:px-10 lg:px-[4.875rem]">
        <div className="max-w-[61rem]">
          <header>
            <h1 className="text-2xl font-semibold text-foreground">
              Files & Folders
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep all your documents organized, secure, and accessible in one
              place.
            </p>
          </header>

          <section aria-label="Files" className="mt-8">
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="flex min-h-[7.125rem] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center transition-colors hover:bg-muted/50 disabled:cursor-wait disabled:opacity-70 sm:w-[24.375rem]"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="size-5 animate-spin text-foreground" />
                ) : (
                  <FilePlus2 className="size-5 text-foreground" />
                )}

                <span className="mt-3 text-sm font-medium text-foreground">
                  {uploadMutation.isPending
                    ? 'Uploading your document...'
                    : 'Add your documents or drag and drop them here'}
                </span>

                <span className="mt-2 text-xs text-muted-foreground">
                  TXT, MD, PDF, DOCX, and XLSX, up to 100 MB
                </span>
              </button>

              {files.length > 0 ? (
                <ul
                  className="flex w-full min-w-0 flex-wrap gap-3 sm:w-auto sm:min-w-[11.625rem] sm:flex-1"
                  aria-live="polite"
                >
                  {files.map((file) => (
                    <BrainFileCard
                      key={file.id}
                      uploadedFile={file}
                      onPreview={setPreviewFile}
                    />
                  ))}
                </ul>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={handleFileChange}
              aria-label="Choose a document to upload"
            />

            {uploadError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {uploadError}
              </p>
            ) : null}

            {filesQuery.isError ? (
              <div className="mt-4 flex items-center gap-3 text-sm">
                <p role="alert" className="text-destructive">
                  Could not load files.
                </p>

                <button
                  type="button"
                  disabled={filesQuery.isFetching}
                  className="font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-70"
                  onClick={() => void filesQuery.refetch()}
                >
                  {filesQuery.isFetching ? 'Trying...' : 'Try again'}
                </button>
              </div>
            ) : null}
          </section>
          {previewFile ? (
            <BrainFilePreviewDialog
              file={previewFile}
              onClose={() => setPreviewFile(null)}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}
