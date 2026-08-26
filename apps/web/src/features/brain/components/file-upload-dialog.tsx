import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@garden/ui/components/ui/dialog'
import { FileText, Loader2 } from 'lucide-react'

type BrainFileUploadDialogProps = {
  fileName: string
  open: boolean
  progress: number
}

/**
 * Keeps upload progress visible in the modal defined by the Files & Folders
 * design. The upload surface stays stable while the browser sends the file.
 */
export function BrainFileUploadDialog({
  fileName,
  open,
  progress,
}: BrainFileUploadDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 p-5 sm:max-w-[24rem]"
      >
        <DialogHeader>
          <DialogTitle>Uploading your file</DialogTitle>
          <DialogDescription className="sr-only">
            Garden is uploading {fileName}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <FileText
            className="mt-0.5 size-8 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {fileName}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Uploading file
            </p>

            <div className="mt-4 flex items-center gap-3">
              <span
                role="progressbar"
                aria-label={`Uploading ${fileName}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
              >
                <span
                  className="block h-full rounded-full bg-foreground transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                {progress}%
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
