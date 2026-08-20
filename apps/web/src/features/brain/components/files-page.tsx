import { FilePlus2 } from 'lucide-react'

export function BrainFilesPage() {
  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            Files & Folders
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep all your documents organized, secure, and accessible in one
            place.
          </p>
        </header>

        <button
          type="button"
          className="mt-10 flex min-h-36 w-full max-w-xl flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center transition-colors hover:bg-muted/50"
        >
          <FilePlus2 className="size-5 text-foreground" />

          <span className="mt-4 text-sm font-medium text-foreground">
            Add your documents or drag and drop them here
          </span>

          <span className="mt-2 text-xs text-muted-foreground">
            TXT, MD, PDF, DOCX, and XLSX, up to 100 MB
          </span>
        </button>
      </div>
    </main>
  )
}
