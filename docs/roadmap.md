# Garden Roadmap

**Current horizon:** dependable small-user beta and internal dogfooding

**Long-term direction:** local-first, edge-native, cloud-optional, and progressively decentralized

**Last reviewed:** 2026-08-19

## What we are building toward

Garden is a workspace where people and AI agents can work together through
chat, tasks, automations, documents, skills, connected tools, sandboxes, and
human approvals.

The current implementation is Cloudflare-first and is preparing for a small
beta. The longer-term goal is a full stack that independent people and
organizations can run, extend, and provide services for without depending on
one cloud, one operator, or one economic mechanism.

In this roadmap:

- **local-first** means useful work and durable local state remain available on
  a person's or organization's own device, with explicit synchronization when
  a connection returns;
- **edge-native** means work can run near its data, users, or physical systems
  when policy, safety, latency, and cost make that the right placement;
- **cloud-optional** means managed cloud remains a convenient choice, not a
  permanent requirement; and
- **decentralized** means control and value can be distributed across
  independently operated layers. Open-source code or distributed machines
  alone do not make the system decentralized.

These are target properties, not claims about the current beta.

## Now — dependable beta

Garden should survive real use by a small group without data leaks, stuck
runs, duplicate actions, silent failures, or confusing recovery paths. Product
scope can stay narrow; the core cannot feel fragile.

### P0 — must land before beta

1. **Access and approval safety**
   - ✅ Better Auth origin and cross-site request-forgery checks restored and
     covered by focused tests.
   - Complete cross-workspace isolation coverage across routes, agent calls,
     inbox, approvals, documents, and attachments
     ([#27](https://github.com/Flow-Research/garden/issues/27)).
   - Require explicit server-side authority before a member changes agent
     permissions, and ensure approval requests reach only authorized reviewers.
     Track vulnerability details through [the security policy](../SECURITY.md)
     until remediation is deployed.
   - Keep risky-tool approval paths closed when authorization, audit, or write
     operations fail.

2. **Run resilience**
   - Prove issue and automation runs start, wait, resume, cancel, fail, and
     recover cleanly through `RunWorkflow` in staging.
   - Ensure terminal states never leave stuck `running` rows, duplicate starts,
     orphaned active runs, or hidden failure reasons.
   - Keep Workflows as the current managed recovery boundary; do not add a
     second queue or transcript-repair system without evidence that it is
     required.

3. **Operational confidence**
   - Add a stable health contract, end-to-end beta smoke tests, staging checks,
     and release evidence
     ([#33](https://github.com/Flow-Research/garden/issues/33)).
   - Cover login and workspace creation, chat, issue runs, automation runs,
     approvals, and document artifacts.
   - Prove backup, restore, release, and rollback procedures for the managed
     beta before treating it as production-ready.

4. **Connector reliability**
   - Harden capability grants, policy enforcement, and catalog drift handling
     ([#28](https://github.com/Flow-Research/garden/issues/28)).
   - Make connector failures visible, attributable, and recoverable.

### P1 — beta quality

- Shorten onboarding from signup to a useful agent action and make failed-run
  recovery understandable.
- Add reverse issue-to-chat breadcrumbs and multi-issue links
  ([#34](https://github.com/Flow-Research/garden/issues/34)).
- Add versioned prompt and configuration provenance, secret-safe traces, a
  failure taxonomy, and regression evaluations
  ([#32](https://github.com/Flow-Research/garden/issues/32)).
- Harden automation authentication, replay protection, idempotency, audit, and
  concurrency contracts
  ([#31](https://github.com/Flow-Research/garden/issues/31)).
- Continue user-interface polish in small slices driven by internal and partner
  workflows rather than broad speculative feature work.

## Next — earn portability from real use

Portability should be extracted from a real, bounded workload rather than from
an attempt to replace every Cloudflare service at once.

1. Inventory the Cloudflare and Neon behavior Garden currently depends on:
   durable agent identity, workflows, files, SQL, sandboxes, model access,
   secrets, and telemetry.
2. Select one funded or partner-backed workflow with an owner, data agreement,
   support boundary, cost cap, and acceptance tests.
3. Define and test only the smallest provider-neutral interface needed by that
   workflow. Keep the current Cloudflare adapter working.
4. Prove a private reference deployment on one machine before adding cluster
   machinery. Compare security, recovery, performance, and fully loaded cost
   with the managed path.
5. Publish the interface and conformance tests so another operator can
   implement the same behavior without changing Garden's product rules.

A valid result is either a working private adapter or evidence that the managed
path should remain in place for that workload. Portability is not achieved by
renaming provider-specific services.

## Then — local and edge operation

- Add an encrypted durable local outbox and an explicit accepted-event sync
  protocol for one useful product surface.
- Make pending, accepted, rejected, and conflicting changes visible to people.
- Preserve local usefulness through network loss, restart, duplicate delivery,
  stale policy, and constrained devices.
- Route workloads by data sensitivity, authority, latency, safety, runtime
  capability, reliability, and total cost—not by price alone.
- Keep irreversible external actions waiting for current authoritative
  approval. Safety-critical physical control remains with independent local
  deterministic interlocks, not a general AI model or an untrusted node.

## Later — federated and open resource layers

Garden may eventually use independently operated compute, storage, inference,
skills, connectors, agents, verification, and hosting services. Each layer
should have an open interface, evidence of service, an accountable operator,
and a way to exit or replace the provider.

Open participation does not mean unrestricted execution. New community nodes
begin with public, low-risk, reproducible work whose results can be
independently checked and safely rejected. Private data, customer secrets,
canonical records, payment authority, and safety-critical control stay on
explicitly approved infrastructure.

Resource markets begin only after a named buyer or budget, a bounded workload,
an acceptance method, fully loaded unit economics, and a safe fallback exist.
Garden supplies the workspace and execution evidence; it does not become a
bank, payment rail, or universal economic ledger.

## Contribution and network economics

Economic incentives follow useful demand; they do not substitute for it.

1. **Now:** contributors may receive recognition for verified work. Current
   points do not automatically promise cash, equity, governance power, credit,
   or tokens.
2. **First funded lane:** a sponsor, partner, or customer pre-funds a bounded
   pool with published work rules, budgets, acceptance evidence, and human
   authorization. Lawful payment rails settle any cash award.
3. **Demand-backed market:** repeated paid use can support independently
   operated skills, agents, connectors, inference, compute, storage, and other
   services. Providers earn for accepted service, not merely for advertising
   idle capacity.
4. **Federation:** common receipts and conformance tests allow independent
   organizations to operate compatible parts of the network and retain value
   at the layer they provide.
5. **Optional later mechanisms:** mutual credit or crypto may be researched
   only when real exchange has demonstrated a problem that contracts and
   regulated local or cross-border payment rails cannot solve adequately. Any
   such mechanism needs separate governance, legal and accounting review,
   security analysis, participant protections, and shutdown rules. Garden's
   usefulness must never depend on issuing a token.

Workstream is the intended governed record for contribution requests,
evidence, review, and acceptance where that lifecycle is required. Its current
v0.1 implementation is incomplete, and it remains separate from Garden's
workspace and execution responsibilities.

## Deliberate anti-priorities

- Do not delay beta hardening to build a token, blockchain, peer-to-peer
  network, universal scheduler, or generic marketplace.
- Do not describe offline development mode as production local-first or
  self-hosted operation.
- Do not replace the working managed path before a second workload proves the
  minimum portable interface.
- Do not put private, regulated, irreversible, or safety-critical work on
  untrusted community infrastructure.
- Do not reward node count, agent calls, compute advertised, or tasks created;
  measure accepted outcomes, reliability, cost, safety, and repeat demand.

## Beta readiness checklist

- [x] Better Auth origin and cross-site request validation enabled.
- [x] A newcomer can run Garden locally without a Cloudflare account through
      the offline development mode.
- [ ] Cross-workspace isolation and permission-management coverage complete.
- [ ] Core smoke tests pass in continuous integration and staging.
- [ ] Runs have visible, recoverable terminal states with duplicate prevention.
- [ ] Connector failures are explainable and recoverable.
- [ ] Approval and audit paths are trustworthy for risky tools.
- [ ] Backup, restore, release, and rollback procedures are tested.
- [ ] A tester can complete: connect tool → chat → create issue → agent run →
      approve action → review output.
