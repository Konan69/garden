import { useQuery } from '@tanstack/react-query'
import { PdfFilePreview } from './pdf-file-preview'
import { Download, FileText, Loader2, X } from 'lucide-react'
import { Button, buttonVariants } from '@garden/ui/components/ui/button'
import { Markdown } from '@garden/ui/markdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@garden/ui/components/ui/dialog'
import type { BrainFileSummary } from '../api'
import { brainFileExtractedTextOptions, brainFileTextOptions } from '../queries'

type PreviewKind = 'docx' | 'pdf' | 'text' | 'unavailable'

function previewKind(filename: string): PreviewKind {
  const normalizedName = filename.toLowerCase()

  if (normalizedName.endsWith('.pdf')) return 'pdf'
  if (normalizedName.endsWith('.docx')) return 'docx'
  if (normalizedName.endsWith('.md') || normalizedName.endsWith('.txt'))
    return 'text'

  return 'unavailable'
}

function getContentUrl(fileId: string, download = false) {
  const baseUrl = `/api/brain/files/${encodeURIComponent(fileId)}/content`
  return download ? `${baseUrl}?download` : baseUrl
}

function PreviewLoading() {
  return (
    <div
      role="status"
      className="flex min-h-[65vh] items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading preview...
    </div>
  )
}

function TextFilePreview({ fileId }: { fileId: string }) {
  const contentQuery = useQuery(brainFileTextOptions(fileId))

  if (contentQuery.isPending) return <PreviewLoading />

  if (contentQuery.isError) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p role="alert" className="text-sm text-destructive">
          Could not load preview.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={contentQuery.isFetching}
          onClick={() => void contentQuery.refetch()}
        >
          {contentQuery.isFetching ? 'Trying...' : 'Try again'}
        </Button>
      </div>
    )
  }

  return (
    <pre className="min-h-[65vh] max-h-[65vh] overflow-auto whitespace-pre-wrap break-words bg-background px-6 py-5 font-mono text-sm leading-6 text-foreground">
      {contentQuery.data}
    </pre>
  )
}

function DocxFilePreview({ fileId }: { fileId: string }) {
  const contentQuery = useQuery(brainFileExtractedTextOptions(fileId))

  if (contentQuery.isPending) return <PreviewLoading />

  if (contentQuery.isError) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p role="alert" className="text-sm text-destructive">
          Could not load preview.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={contentQuery.isFetching}
          onClick={() => void contentQuery.refetch()}
        >
          {contentQuery.isFetching ? 'Trying...' : 'Try again'}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-[65vh] max-h-[65vh] overflow-auto bg-background px-8 py-6 text-foreground">
      <Markdown mode="full" className="mx-auto max-w-3xl">
        {contentQuery.data}
      </Markdown>
    </div>
  )
}

/**
 * Shows a workspace file through the authenticated Brain content route.
 * PDF, DOCX, TXT, and MD files render inline. Other supported files keep a
 * clear download path when Garden cannot render them in the browser.
 */
export function BrainFilePreviewDialog({
  file,
  onClose,
}: {
  file: BrainFileSummary
  onClose: () => void
}) {
  const downloadUrl = getContentUrl(file.id, true)
  const kind = previewKind(file.name)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="grid max-h-[90vh] max-w-5xl! grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl!"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-center gap-3 border-b px-5 py-4">
          <FileText
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm">{file.name}</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Workspace file
            </DialogDescription>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>

        <div className="min-h-0 overflow-auto bg-muted/20">
          {kind === 'text' ? (
            <TextFilePreview fileId={file.id} />
          ) : kind === 'docx' ? (
            <DocxFilePreview fileId={file.id} />
          ) : kind === 'pdf' ? (
            <PdfFilePreview fileId={file.id} />
          ) : (
            <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
              <FileText
                className="size-10 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Preview unavailable
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Download this file to open it on your device.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-background px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>

          <a
            href={downloadUrl}
            download={file.name}
            className={buttonVariants({ variant: 'default' })}
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
