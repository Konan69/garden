import {
  Session,
  Think,
  type TurnConfig,
  type TurnContext,
} from '@cloudflare/think'
import type { LanguageModel, ToolSet, UIMessage } from 'ai'
import { createAgentModel } from './model'
import { configureThinkCompaction } from './think-compaction'
import {
  BRAIN_AUDIT_SYSTEM_PROMPT,
  BRAIN_AUDIT_TOOL_NAMES,
  brainAuditToolContext,
  createBrainAuditMessage,
  createBrainAuditTools,
  type BrainAuditRunInput,
} from './brain-audit'

type AgentRuntimeEnv = Cloudflare.Env & {
  AI: Ai
  AI_GATEWAY_ID?: string
  ENVIRONMENT?: string
  FILES: R2Bucket
  HELIX_URL?: string
  HELIX_API_KEY?: string
  VITE_PUBLIC_POSTHOG_HOST?: string
  VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string
}

type BrainAuditConfig = ReturnType<typeof brainAuditToolContext>

const THINK_TURN_MAX_RETRIES = 1
const THINK_TURN_TELEMETRY_FUNCTION_ID = 'garden.brain-audit.turn'

/**
 * Runs one bounded, ephemeral structuring pass over an indexed Brain item.
 * Before uploads ended at extract/chunk/embed/index; this Think facet now uses
 * the same model and Session compaction wiring as automation runs while making
 * only Brain tools active. Cloudflare Think `configure` and `saveMessages`
 * provide durable private context and the programmatic turn boundary.
 */
export class BrainAuditSubAgent extends Think<AgentRuntimeEnv> {
  maxSteps = 30

  getModel(): LanguageModel {
    return createAgentModel({
      ai: this.env.AI,
      env: this.env,
      gatewayId: this.env.AI_GATEWAY_ID,
    })
  }

  /**
   * Installs only the static audit contract in Session context. Automation runs
   * established the cached compaction pattern; audit facets omit agent skills
   * and broader workspace personality because this task has one fixed purpose.
   */
  override async configureSession(session: Session) {
    return configureThinkCompaction(session, this.getModel())
      .withContext('brain-audit', {
        description: 'Static-ingestion document structuring contract.',
        provider: { get: async () => BRAIN_AUDIT_SYSTEM_PROMPT },
      })
      .withCachedPrompt()
  }

  override getSkills() {
    return []
  }

  /**
   * Binds Brain operations to persisted audit identity. Before this facet there
   * was no agent-authored ingestion context; mentions, links, and metadata now
   * carry the workspace agent and deterministic item-scoped run id.
   */
  override getTools(): ToolSet {
    return createBrainAuditTools({
      env: {
        ...(this.env.HELIX_URL === undefined
          ? {}
          : { HELIX_URL: this.env.HELIX_URL }),
        ...(this.env.HELIX_API_KEY === undefined
          ? {}
          : { HELIX_API_KEY: this.env.HELIX_API_KEY }),
      },
      ai: this.env.AI,
      files: this.env.FILES,
      getContext: () => this.getConfig<BrainAuditConfig>(),
    })
  }

  /**
   * Pins the inference surface to Brain tools despite Think's automatic
   * workspace/MCP tool assembly. Model, retry, reasoning, and 30-step budget
   * match AutomationRunSubAgent; no separate queue, workflow, or recovery layer
   * is introduced for this best-effort post-index task.
   */
  override async beforeTurn(_ctx: TurnContext): Promise<TurnConfig> {
    const config = this.getConfig<BrainAuditConfig>()
    if (config === null) {
      throw new Error('BrainAuditSubAgent.beforeTurn missing audit context.')
    }

    return {
      model: this.getModel(),
      experimental_telemetry: {
        functionId: THINK_TURN_TELEMETRY_FUNCTION_ID,
        isEnabled: true,
        metadata: {
          agentClass: 'BrainAuditSubAgent',
          itemId: this.name,
          runId: config.runId,
        },
        recordInputs: false,
        recordOutputs: false,
      },
      activeTools: [...BRAIN_AUDIT_TOOL_NAMES],
      maxRetries: THINK_TURN_MAX_RETRIES,
      maxSteps: this.maxSteps,
      sendReasoning: true,
    }
  }

  /**
   * Persists item-scoped tool identity, then waits for one SDK-owned
   * `saveMessages` turn. Previously callers would need bespoke orchestration;
   * the parent AgentDO can now invoke this method and reclaim the facet after
   * the turn reaches a terminal status.
   */
  async runAudit(input: BrainAuditRunInput): Promise<{ status: 'completed' }> {
    this.configure<BrainAuditConfig>(brainAuditToolContext(input))
    const message: UIMessage = {
      id: `brain-audit:${input.itemId}:source`,
      role: 'user',
      parts: [
        {
          type: 'text',
          text: createBrainAuditMessage(input),
        },
      ],
    }
    const result = await this.saveMessages([message])
    if (result.status !== 'completed') {
      throw new Error(
        `Brain audit turn ${result.status}${result.error ? `: ${result.error}` : ''}`,
      )
    }
    return { status: 'completed' }
  }
}
