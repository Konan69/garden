import { LegalDocument } from './legal-document'

const EFFECTIVE_DATE = 'August 21, 2026'

/** Public explanation of how Flow Research handles data in Garden. */
export function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="This policy explains what information Garden handles, why we use it, when it leaves your workspace, and the choices available to you."
      effectiveDate={EFFECTIVE_DATE}
    >
      <section>
        <h2>1. Who this policy covers</h2>
        <p>
          Garden is a workspace for people and AI agents, developed and operated
          by Flow Research (“Garden,” “we,” “us,” or “our”). This policy applies
          to the hosted Garden service, its websites, and related support
          interactions (together, the “Service”).
        </p>
        <p>
          If you use Garden through an employer or another organization, that
          organization controls its workspace and may decide what information is
          added, who may access it, and how long it is kept. For workspace
          content we process on its instructions, your organization is normally
          the controller or business and Flow Research acts as its processor or
          service provider. Contact your workspace administrator first for
          requests about organization-controlled content.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account and profile information.</strong> Name, email
            address, profile image, authentication records, workspace
            memberships, invitations, roles, and account preferences. Passwords
            are stored as cryptographic hashes, not readable plain text.
          </li>
          <li>
            <strong>Workspace content.</strong> Chats and prompts, agent
            outputs, issues, comments, documents, attachments, skills,
            automation settings, approval decisions, and other material you or
            your teammates submit to the Service.
          </li>
          <li>
            <strong>Agent and activity records.</strong> Instructions, tool
            requests and outcomes, run state, token and latency measurements,
            audit events, and error details needed to operate and review agent
            work.
          </li>
          <li>
            <strong>Connected-service information.</strong> When you connect a
            third-party service, we receive account identifiers, granted scopes,
            authorization tokens, connection status, and information returned by
            that service when you or an agent uses it. We only request access
            required for the features you enable.
          </li>
          <li>
            <strong>Device and usage information.</strong> IP address, user
            agent, session identifiers, pages and product features used,
            approximate location inferred from IP, timestamps, performance data,
            and diagnostic events. Garden disables analytics session recording.
          </li>
          <li>
            <strong>Communications.</strong> Information you provide when you
            ask for support, report a problem, join research, or otherwise
            contact us.
          </li>
        </ul>
        <p>
          We receive information directly from you, from your workspace and its
          members, automatically from your device, and from services you choose
          to connect. Please avoid placing sensitive personal information in
          prompts or workspace content unless it is necessary and authorized.
        </p>
      </section>

      <section>
        <h2>3. How and why we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>create accounts, authenticate users, and manage workspaces;</li>
          <li>
            provide chat, agents, issues, documents, automations, integrations,
            permissions, and other requested features;
          </li>
          <li>
            send service messages such as invitations, password resets, security
            notices, and material product updates;
          </li>
          <li>
            maintain security, prevent abuse, enforce permissions, investigate
            incidents, and preserve audit history;
          </li>
          <li>
            understand product performance, diagnose failures, and improve the
            reliability and usability of Garden; and
          </li>
          <li>
            comply with law and establish, exercise, or defend legal claims.
          </li>
        </ul>
        <p>
          Where applicable law requires a legal basis, we rely on performance of
          our contract with you or your organization, our legitimate interests
          in operating and securing the Service, compliance with legal
          obligations, and consent where we specifically ask for it. You may
          withdraw consent at any time, without affecting earlier processing.
        </p>
      </section>

      <section>
        <h2>4. AI processing and connected services</h2>
        <p>
          Garden sends the context needed to complete your request—such as
          prompts, selected workspace content, tool definitions, and relevant
          conversation history—to the AI model provider configured for the
          deployment. Agents may also send information to a connected service
          when you request an action or when an authorized automation runs.
        </p>
        <p>
          Flow Research does not use private workspace content to train its own
          general-purpose AI models. Model and integration providers process
          information under their agreements with Flow Research or, for services
          you connect directly, under the settings and terms applicable to your
          account. AI output can be inaccurate. Garden records activity and
          approval decisions so workspace members can review consequential agent
          actions; Garden does not use AI to make legal or similarly significant
          decisions about individuals on Flow Research’s behalf.
        </p>
      </section>

      <section>
        <h2>5. When we disclose information</h2>
        <p>We may disclose information to:</p>
        <ul>
          <li>
            <strong>Your workspace.</strong> Administrators and other members
            can access information according to workspace roles, sharing
            settings, and product behavior.
          </li>
          <li>
            <strong>Infrastructure and service providers.</strong> Vendors that
            support hosting, databases, file storage, AI inference, analytics,
            error monitoring, email delivery, security, and customer support.
            They may process information only to provide contracted services to
            us.
          </li>
          <li>
            <strong>Services you enable.</strong> Providers such as GitHub,
            Google, Discord, Slack, or other connector and MCP services, when
            you authorize a connection or ask Garden to use it.
          </li>
          <li>
            <strong>Legal and safety recipients.</strong> Authorities, advisers,
            or other parties when reasonably necessary to comply with law,
            protect people and the Service, or investigate fraud or abuse.
          </li>
          <li>
            <strong>Business transaction participants.</strong> A buyer,
            successor, investor, or adviser in connection with a financing,
            reorganization, merger, or sale, subject to appropriate safeguards.
          </li>
        </ul>
        <p>
          We do not sell personal information for money. We do not share
          personal information for cross-context behavioral advertising, and we
          do not use workspace content to target advertisements.
        </p>
      </section>

      <section>
        <h2>6. Cookies and local storage</h2>
        <p>
          Garden uses session cookies and similar storage required to keep you
          signed in, protect requests, remember interface preferences, and
          operate the Service. When analytics is enabled, we use PostHog to
          measure page views, feature use, performance, and errors. Session
          replay is disabled. You can control cookies through your browser, but
          blocking essential storage may prevent sign-in or other features from
          working.
        </p>
      </section>

      <section>
        <h2>7. International data transfers</h2>
        <p>
          Garden and its providers may process information in countries other
          than the one where you live. Where required, we use recognized
          transfer mechanisms and contractual safeguards designed to protect
          personal information. Your organization may choose additional
          providers or self-host Garden, which can change where its workspace
          data is processed.
        </p>
      </section>

      <section>
        <h2>8. Retention</h2>
        <p>
          We keep account and workspace information while the applicable account
          or workspace remains active and as needed to provide the Service. We
          retain security, audit, backup, transaction, and support records for
          as long as reasonably necessary for their purpose, legal obligations,
          or dispute resolution. Retention may depend on workspace settings,
          contractual commitments, the nature of the information, and technical
          backup cycles. When information is no longer required, we delete or
          de-identify it. Connected providers retain information under their own
          policies.
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>
          We use technical and organizational safeguards intended to protect
          information, including access controls, encryption in transit,
          secret-redaction practices, workspace isolation, and activity logs. No
          method of storage or transmission is completely secure. Keep your
          credentials confidential, use only trusted integrations, review agent
          permissions, and tell us promptly if you suspect unauthorized access.
        </p>
      </section>

      <section>
        <h2>10. Your rights and choices</h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, restrict, object to, or receive a portable copy of personal
          information; withdraw consent; or appeal a decision about a request.
          You may also have the right to complain to your local data-protection
          authority. We will not discriminate against you for exercising a
          privacy right.
        </p>
        <p>
          You can update some profile information in Garden, disconnect
          integrations from connection settings, and ask a workspace
          administrator to manage organization-controlled content. For a request
          to Flow Research, use the “Start a conversation” contact at{' '}
          <a href="https://flowresearch.tech/">flowresearch.tech</a> and label
          your message “Privacy request.” We may verify your identity and
          authority before acting. Authorized agents may submit requests where
          permitted by law.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          Garden is a work service and is not directed to children under 16. We
          do not knowingly collect personal information from children under 16.
          If you believe a child has provided information to Garden, contact us
          so we can investigate and take appropriate action.
        </p>
      </section>

      <section>
        <h2>12. Changes to this policy</h2>
        <p>
          We may update this policy as Garden, our providers, or applicable law
          changes. We will post the revised policy with a new effective date
          and, when a change materially affects your rights, provide additional
          notice through the Service or by email where appropriate.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Flow Research is responsible for this policy. For privacy questions or
          requests, use the “Start a conversation” contact at{' '}
          <a href="https://flowresearch.tech/">flowresearch.tech</a> and
          identify the message as a privacy matter. Do not post private account
          or workspace information in a public GitHub issue.
        </p>
      </section>
    </LegalDocument>
  )
}
