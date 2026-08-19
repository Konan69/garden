# Known Gaps

This index separates three things that are easy to confuse:

1. current code-verified gaps blocking a dependable beta;
2. implemented development paths that are not yet production capabilities; and
3. longer-term research required for local-first, edge-native, cloud-optional,
   and progressively decentralized operation.

**Last reviewed:** 2026-08-19

**Current release posture:** active development; preparing for a small-user beta

The [roadmap](../roadmap.md) owns priority and sequence. Area files below own
the technical evidence. Meeting notes and strategy documents can inform the
direction, but they do not override code, tests, accepted issues, or this
current-versus-target distinction.

## Beta-critical gaps

| Priority | Public issue                                             | Outcome                                                                                 | Canonical detail                                               |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Critical | Security remediation in progress                         | Enforce server-side authority for permission changes                                    | [Auth and access](./auth-and-access.md)                        |
| High     | [#27](https://github.com/Flow-Research/garden/issues/27) | Cross-workspace isolation regression coverage                                           | [Auth and access](./auth-and-access.md)                        |
| High     | Security remediation in progress                         | Safe connector defaults and authorized approval routing                                 | [Connectors](./connectors.md)                                  |
| High     | Tracking needed                                          | Staging proof for the complete issue and automation run lifecycle                       | [Issue flow](./issue-flow.md), [Automations](./automations.md) |
| High     | [#33](https://github.com/Flow-Research/garden/issues/33) | Health contract, end-to-end beta smoke tests, staging, release, and observability gates | [Infrastructure](./infrastructure.md)                          |
| High     | [#28](https://github.com/Flow-Research/garden/issues/28) | Connector capability grants, policy enforcement, and catalog drift                      | [Connectors](./connectors.md)                                  |
| Medium   | Tracking needed                                          | Onboarding and failed-run recovery polish                                               | [UI and product](./ui-and-product.md)                          |
| Medium   | [#34](https://github.com/Flow-Research/garden/issues/34) | Reverse issue-to-chat breadcrumbs and multi-issue links                                 | [Issue flow](./issue-flow.md)                                  |
| Medium   | [#32](https://github.com/Flow-Research/garden/issues/32) | Prompt/configuration provenance, secret-safe tracing, and evaluation coverage           | [Prompt and system spec](./prompt-and-system-spec.md)          |
| Medium   | [#31](https://github.com/Flow-Research/garden/issues/31) | Automation authentication, replay, idempotency, audit, and concurrency                  | [Automations](./automations.md)                                |

“Tracking needed” means the gap is documented but does not have a verified
matching public GitHub issue. The older `FLO-*` labels in these documents are
internal work-item names and should not be mistaken for GitHub issue numbers.
Public documents describe security outcomes without reproducing exploit
details. Report vulnerabilities through [the security policy](../../SECURITY.md).

## Current capability boundaries

| Area                 | What exists now                                                                                                                               | What must not be claimed yet                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Local development    | `pnpm offline:up` starts local dependencies; optional Ollama uses `pnpm offline:up:ollama`; `pnpm dev:offline` then starts the local web app. | Production offline-first operation, safe multi-device synchronization, disconnected external effects, or a supported self-host package. |
| Managed runtime      | Cloudflare Workers, Durable Objects, Workflows, R2, D1, Sandbox, and Neon support the current development/reference path.                     | Provider neutrality, automatic failover between providers, or production portability.                                                   |
| Agents and work      | Chat, issues, automations, skills, documents, connectors, tool grants, and sandboxed execution paths exist.                                   | General autonomous management, an organization-wide memory, or unrestricted agent authority.                                            |
| Contribution records | Garden can expose work and evidence in its workspace.                                                                                         | A complete Workstream review-to-acceptance lifecycle, settlement, reputation, or automatic rewards.                                     |
| Open source          | The code is available under AGPL-3.0-only and can be studied, changed, and run under that license.                                            | A decentralized network, permissionless production execution, or a live provider marketplace.                                           |

## Directional gaps — research, not beta commitments

These are real gaps between the current implementation and the stated
destination. They are not promises that every item will be built, nor reasons
to postpone the beta-critical work above.

### Local-first and synchronization

- No production durable local outbox or accepted-event synchronization
  protocol exists.
- Conflict handling, stale-policy rejection, device revocation, encrypted
  local state, and partition recovery are not yet product contracts.
- Irreversible external actions cannot safely proceed from unaccepted offline
  state.

### Provider portability and self-hosting

- Production behavior depends on Cloudflare-specific Durable Objects,
  Workflows, R2, D1, Sandbox, Workers AI, and related deployment semantics.
- `compose.dev.yaml` is a development convenience, not a supported production
  distribution.
- There is no provider-neutral conformance suite, private reference adapter,
  supported upgrade/rollback path, or fully loaded managed-versus-private cost
  comparison.

### Edge and federated execution

- No node enrollment, placement policy, signed job/result envelope,
  attestation, metering, quarantine, or cross-operator conformance protocol is
  implemented.
- The system does not yet prove which data and workloads may run on which
  devices, regions, providers, or trust levels.
- Garden and general AI models are not safety functions or hard-real-time
  industrial controllers. Physical autonomy requires independent local
  deterministic interlocks and qualified safety ownership.

### Open resource and value layers

- There is no live market for compute, storage, inference, skills, agents,
  connectors, verification, or hosting.
- Open registration must not become unrestricted execution. Untrusted nodes
  are initially suitable only for public, low-risk, independently verifiable
  work whose failure can be safely rejected.
- Pricing, payment custody, contribution acceptance, reputation, and financial
  claims remain outside DevOps/runtime meters and outside Garden's core
  authority.

### Economic incentives

- Current points are recognition records, not an automatic promise of cash,
  equity, governance power, mutual credit, or tokens.
- A first reward lane requires a pre-funded, bounded pool, published rules,
  accepted evidence, human authorization, lawful settlement, reconciliation,
  disputes, and a stop condition.
- Mutual credit or crypto remains optional later research. It requires proven
  exchange demand, separate governance and legal/accounting treatment, and a
  clear reason ordinary regulated payment rails and portable receipts are
  insufficient. Garden must remain useful without a token.

## Area index

| File                                                         | Scope                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| [auth-and-access.md](./auth-and-access.md)                   | Better Auth, permissions, and workspace isolation                  |
| [agent-runtime.md](./agent-runtime.md)                       | Runtime topology and shared-resource decisions                     |
| [automations.md](./automations.md)                           | Trigger contracts, concurrency, and durable-run proof              |
| [infrastructure.md](./infrastructure.md)                     | Health, staging, beta smoke, release, backup, and restore coverage |
| [issue-flow.md](./issue-flow.md)                             | Run lifecycle and issue/chat relationships                         |
| [prompt-and-system-spec.md](./prompt-and-system-spec.md)     | Prompt provenance, traces, and evaluations                         |
| [realtime-sync.md](./realtime-sync.md)                       | Current realtime boundary and future synchronization research      |
| [runtime-sandbox-codemode.md](./runtime-sandbox-codemode.md) | Codemode, container Sandbox, and filesystem boundaries             |
| [ui-and-product.md](./ui-and-product.md)                     | Onboarding and recovery polish                                     |
| [deferred.md](./deferred.md)                                 | Post-beta ideas and open design questions                          |
| [connectors.md](./connectors.md)                             | Connector-specific inventory and policy gaps                       |

## Updating this index

- Prefer code, tests, public issue state, and dated operational evidence over
  meeting aspiration.
- Label every statement as current capability, active work, experiment, or
  long-term direction.
- Move completed gaps out of the active table when the merged code and tests
  prove closure; closing an issue without that evidence is insufficient.
- Do not convert economic or decentralization research into product claims
  without an accepted implementation decision and measurable gate.
