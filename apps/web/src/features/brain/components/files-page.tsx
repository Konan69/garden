import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, Loader2 } from 'lucide-react'
import { BrainFileTypeIcon } from './file-type-icon'
import { uploadBrainFile, retryBrainFile, type BrainFileSummary } from '../api'
import { brainFileKeys, brainFileListOptions } from '../queries'
import { BrainFilePreviewDialog } from './file-preview-dialog'
import { BrainFileUploadDialog } from './file-upload-dialog'

const ACCEPTED_FILE_TYPES = '.txt,.md,.pdf,.docx,.xlsx'

/** Shows one file, its indexing state, and its available recovery action. */
function BrainFileCard({
  isPolling,
  isRetrying,
  onPreview,
  onRetry,
  uploadedFile,
}: {
  isPolling: boolean
  isRetrying: boolean
  onPreview: (file: BrainFileSummary) => void
  onRetry: (file: BrainFileSummary) => void
  uploadedFile: BrainFileSummary
}) {
  const canPreview = uploadedFile.status === 'ready'
  const canRetry =
    uploadedFile.status === 'failed' ||
    (uploadedFile.status === 'processing' && !isPolling)
  const statusLabel =
    uploadedFile.status === 'ready'
      ? 'Ready'
      : uploadedFile.status === 'failed'
        ? 'Failed'
        : 'Processing'

  return (
    <li className="flex min-h-[7.125rem] w-full flex-col justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 sm:w-[11.625rem]">
      <button
        type="button"
        disabled={!canPreview}
        onClick={() => onPreview(uploadedFile)}
        aria-label={`Preview ${uploadedFile.name}`}
        className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-left disabled:cursor-default"
      >
        <BrainFileTypeIcon
          fileName={uploadedFile.name}
          className="mt-0.5 size-6"
        />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {uploadedFile.name}
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isPolling || isRetrying ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : null}

          {isRetrying ? 'Retrying' : statusLabel}
        </p>

        {canRetry ? (
          <button
            type="button"
            aria-label={`Retry ${uploadedFile.name}`}
            disabled={isRetrying}
            onClick={() => onRetry(uploadedFile)}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-70"
          >
            Retry
          </button>
        ) : null}
      </div>
    </li>
  )
}

/** Manages workspace file listing, upload review, retry, polling, and preview. */
export function BrainFilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewFile, setPreviewFile] = useState<BrainFileSummary | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [sessionUploadIds, setSessionUploadIds] = useState<readonly string[]>(
    [],
  )
  const queryClient = useQueryClient()
  const filesQuery = useQuery(brainFileListOptions(sessionUploadIds))
  const files = filesQuery.data ?? []
  const sessionUploadIdSet = new Set(sessionUploadIds)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadBrainFile(file, setUploadProgress),
    onMutate: () => setUploadProgress(0),
    onSuccess: async (uploadedFile) => {
      await queryClient.cancelQueries({
        queryKey: brainFileKeys.list(),
        exact: true,
      })

      queryClient.setQueryData<BrainFileSummary[]>(
        brainFileKeys.list(),
        (currentFiles = []) => [
          uploadedFile,
          ...currentFiles.filter((file) => file.id !== uploadedFile.id),
        ],
      )

      if (uploadedFile.status === 'processing') {
        setSessionUploadIds((currentIds) =>
          currentIds.includes(uploadedFile.id)
            ? currentIds
            : [...currentIds, uploadedFile.id],
        )

        void queryClient.invalidateQueries({
          queryKey: brainFileKeys.list(),
          exact: true,
        })
      }
    },
    onSettled: () => {
      setUploadProgress(0)
      setSelectedFile(null)
    },
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryBrainFile(id),
    onSuccess: async (retriedFile) => {
      await queryClient.cancelQueries({
        queryKey: brainFileKeys.list(),
        exact: true,
      })

      queryClient.setQueryData<BrainFileSummary[]>(
        brainFileKeys.list(),
        (currentFiles = []) =>
          currentFiles.map((file) =>
            file.id === retriedFile.id ? retriedFile : file,
          ),
      )

      if (retriedFile.status === 'processing') {
        setSessionUploadIds((currentIds) =>
          currentIds.includes(retriedFile.id)
            ? currentIds
            : [...currentIds, retriedFile.id],
        )

        void queryClient.invalidateQueries({
          queryKey: brainFileKeys.list(),
          exact: true,
        })
      }
    },
  })

  /**
   * Opens the review modal without starting the network upload.
   */
  const reviewFile = (file: File | undefined) => {
    if (file === undefined || uploadMutation.isPending) return
    setSelectedFile(file)
  }

  /**
   * Starts the upload after the user confirms the selected file.
   */
  const confirmUpload = () => {
    if (selectedFile === null || uploadMutation.isPending) return
    uploadMutation.mutate(selectedFile)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    reviewFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    reviewFile(event.dataTransfer.files[0])
  }

  const uploadError =
    uploadMutation.error instanceof Error
      ? uploadMutation.error.message
      : uploadMutation.error
        ? 'The file could not be uploaded.'
        : null
  const retryError =
    retryMutation.error instanceof Error
      ? retryMutation.error.message
      : retryMutation.error
        ? 'The file could not be retried.'
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
                <FilePlus2 className="size-5 text-foreground" />

                <span className="mt-3 text-sm font-medium text-foreground">
                  Add your documents or drag and drop them here
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
                      isPolling={
                        file.status === 'processing' &&
                        sessionUploadIdSet.has(file.id) &&
                        !filesQuery.isError
                      }
                      isRetrying={
                        retryMutation.isPending &&
                        retryMutation.variables === file.id
                      }
                      onRetry={(fileToRetry) =>
                        retryMutation.mutate(fileToRetry.id)
                      }
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

            {retryError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {retryError}
              </p>
            ) : null}

            {filesQuery.isError ? (
              <div className="mt-4 flex items-center gap-3 text-sm">
                <p role="alert" className="text-destructive">
                  {filesQuery.isRefetchError
                    ? 'Could not refresh file statuses.'
                    : 'Could not load files.'}
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

          <BrainFileUploadDialog
            file={selectedFile}
            uploading={uploadMutation.isPending}
            progress={uploadProgress}
            onConfirm={confirmUpload}
            onClose={() => setSelectedFile(null)}
          />
        </div>
      </div>
    </main>
  )
}
