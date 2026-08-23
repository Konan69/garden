import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useAuthStore } from '@garden/app-state/auth'
import { useWorkspaceStore } from '@garden/app-state/workspace'
import { Button } from '@garden/ui/components/ui/button'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@garden/ui/components/ui/alert'
import { SidebarInset, SidebarProvider } from '@garden/ui/components/ui/sidebar'
import { Skeleton } from '@garden/ui/components/ui/skeleton'
import { SearchCommand } from '@/features/search'
import { ChatRuntimeProvider } from '@/features/chat/chat-runtime-provider'
import { CreateWorkspaceModal } from '@/features/modals/create-workspace'
import { SettingsDialog } from '@/features/settings'
import { IssueDeepLinkListener } from '@/features/issues/components/issue-deep-link-listener'
import { getConnectorCallbackEvent } from '@/lib/api/connections'
import {
  agentListOptions,
  connectionListOptions,
  memberListOptions,
  skillListOptions,
  workspaceKeys,
} from '@/lib/workspace/queries'
import { WorkspaceSidebar } from './sidebar'
import {
  useRequiredWorkspaceDock,
  WorkspaceDockProvider,
  WorkspaceDockView,
} from './workspace-dock'

/**
 * Mount-only prefetch for workspace-wide caches.
 *
 * Why this exists: the New automation dialog (and other pickers across the
 * app) need agents, skills, and connectors. Previously each consumer
 * gated its own useQuery with `enabled: open`, so the dialog itself drove
 * the cold fetch and the user watched the tools list pop in late. That
 * coupled every consumer to fetch behavior. Warming once at workspace
 * mount makes consumers pure cache readers — no surface area on them.
 *
 * Renders nothing; the useQuery calls only exist to seed the React Query
 * cache for the active workspace.
 */
function WorkspaceWarmCaches({ wsId }: { wsId: string }) {
  useQuery(agentListOptions(wsId))
  useQuery(memberListOptions(wsId))
  useQuery(skillListOptions(wsId))
  useQuery(connectionListOptions(wsId))
  return null
}

function WorkspaceLoadingSkeleton() {
  return (
    <section
      className="flex h-full flex-1 flex-col gap-3 p-4"
      aria-label="Loading workspace"
      aria-busy="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-11/12 rounded-md" />
        <Skeleton className="h-4 w-10/12 rounded-md" />
        <Skeleton className="h-4 w-9/12 rounded-md" />
      </div>
    </section>
  )
}

function WorkspaceSetupState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex h-full flex-1 items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-foreground">
            Create a workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            Your account is ready. Create a workspace or open an invitation link
            to join one.
          </p>
        </div>
        <Button size="sm" onClick={onCreate}>
          New workspace
        </Button>
      </div>
    </section>
  )
}

/** Shows connector callback outcomes at the workspace boundary where redirects land. */
function ConnectorCallbackNotice({
  connectorFlowId,
  connectorId,
  workspaceId,
}: {
  connectorFlowId?: string | null
  connectorId?: string | null
  workspaceId: string
}) {
  const [dismissed, setDismissed] = useState(false)
  const dock = useRequiredWorkspaceDock()
  const queryClient = useQueryClient()
  const flowId = connectorFlowId?.trim() ?? ''
  const callback = useQuery({
    queryKey: ['connector-callback-event', flowId, connectorId ?? null],
    queryFn: () =>
      getConnectorCallbackEvent({ flowId, connectorId: connectorId ?? null }),
    enabled: flowId.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  if (!flowId || dismissed) return null

  const event = callback.data?.event
  const failed = callback.isError || event?.status === 'error'
  const title = callback.isPending
    ? 'Finishing connection'
    : failed
      ? 'Connection needs attention'
      : event?.status === 'degraded'
        ? `${event.connectorLabel} needs attention`
        : `${event?.connectorLabel ?? 'Connection'} connected`
  const description = callback.isPending
    ? 'Checking the provider callback status.'
    : callback.isError
      ? 'Open Connections to review the provider status and repair it.'
      : (event?.message ?? 'Provider access is ready.')

  const dismissNotice = () => {
    setDismissed(true)
    const url = new URL(window.location.href)
    url.searchParams.delete('connector_flow')
    url.searchParams.delete('connector_id')
    window.history.replaceState(window.history.state, '', url.toString())
  }

  return (
    <Alert
      variant={failed ? 'destructive' : 'default'}
      className="absolute top-3 right-3 z-50 w-[min(28rem,calc(100%-1.5rem))] bg-background/95 pr-28 shadow-lg backdrop-blur"
    >
      {failed || event?.status === 'degraded' ? (
        <CircleAlert className="size-4" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertAction className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await queryClient.invalidateQueries({
              queryKey: workspaceKeys.connections(workspaceId),
            })
            dismissNotice()
            dock.openPanel({
              kind: 'capabilities',
              title: 'Connections',
              entityId: connectorId ?? event?.connectorId,
            })
          }}
        >
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissNotice}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function WorkspaceLayout({
  connectorFlowId = null,
  connectorId = null,
  issueId = null,
}: {
  connectorFlowId?: string | null
  connectorId?: string | null
  issueId?: string | null
} = {}) {
  const user = useAuthStore((state) => state.user)
  const workspace = useWorkspaceStore((state) => state.workspace)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)

  const hasSession = Boolean(user)
  const activeWorkspaceId = workspace?.id ?? null
  // Authenticated route loader data hydrates the singleton auth/workspace stores
  // in a microtask. During that first client frame, both stores can still be
  // empty even though the workspace is loading, so show a neutral skeleton
  // instead of incorrectly asking the user to finish setup.
  const isRestoringWorkspace = !hasSession && !activeWorkspaceId

  return (
    <SidebarProvider className="h-svh">
      <WorkspaceDockProvider
        workspaceId={activeWorkspaceId ?? 'workspace-shell'}
      >
        {activeWorkspaceId ? (
          <>
            <WorkspaceWarmCaches wsId={activeWorkspaceId} />
            <IssueDeepLinkListener
              workspaceId={activeWorkspaceId}
              issueId={issueId}
            />
            <ConnectorCallbackNotice
              connectorFlowId={connectorFlowId}
              connectorId={connectorId}
              workspaceId={activeWorkspaceId}
            />
            <ChatRuntimeProvider>
              <WorkspaceSidebar
                onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
              />
              <SidebarInset className="relative overflow-hidden !my-2 !mr-2 !ml-0 !rounded-[14px] !bg-[color:var(--vellum)] backdrop-blur-xl saturate-110 shadow-[inset_0_0_0_0.5px_rgba(26,31,28,0.08)] dark:shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.28)]">
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                  <WorkspaceDockView />
                </div>
              </SidebarInset>
              <SearchCommand />
              <SettingsDialog />
            </ChatRuntimeProvider>
          </>
        ) : (
          <SidebarInset className="relative overflow-hidden !my-2 !mr-2 !ml-2 !rounded-[14px] !bg-[color:var(--vellum)] backdrop-blur-xl saturate-110 shadow-[inset_0_0_0_0.5px_rgba(26,31,28,0.08)] dark:shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.28)]">
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {isRestoringWorkspace ? (
                <WorkspaceLoadingSkeleton />
              ) : (
                <WorkspaceSetupState
                  onCreate={() => setCreateWorkspaceOpen(true)}
                />
              )}
            </div>
          </SidebarInset>
        )}
      </WorkspaceDockProvider>
      {createWorkspaceOpen ? (
        <CreateWorkspaceModal onClose={() => setCreateWorkspaceOpen(false)} />
      ) : null}
    </SidebarProvider>
  )
}
