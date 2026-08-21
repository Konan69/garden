import { LegalDocument } from './legal-document'

const EFFECTIVE_DATE = 'August 21, 2026'

/** Public contract for use of Flow Research's hosted Garden service. */
export function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      summary="These terms set the rules for using Garden’s hosted workspace, AI agents, automations, and connected tools."
      effectiveDate={EFFECTIVE_DATE}
    >
      <section>
        <h2>1. Agreement</h2>
        <p>
          These Terms of Service (“Terms”) are an agreement between you and Flow
          Research (“Garden,” “we,” “us,” or “our”) governing your access to the
          hosted Garden service, websites, agents, automations, integrations,
          and related features (together, the “Service”). By creating an
          account, joining a workspace, or using the Service, you agree to these
          Terms and our <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          If you use Garden for an organization, you represent that you are
          authorized to accept these Terms for it. “You” then includes that
          organization. If you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and accounts</h2>
        <p>
          You must be at least 18 years old or the age of legal majority where
          you live and able to enter a binding contract. You must provide
          accurate account information, protect your credentials, and promptly
          update information that changes. You are responsible for activity
          under your account unless you promptly report unauthorized use.
        </p>
        <p>
          Workspace owners and administrators control membership, roles,
          permissions, integrations, and workspace content. If an organization
          provides your account, it may manage or remove your access and may
          access information associated with its workspace. Resolve internal
          access and ownership questions with your workspace administrator.
        </p>
      </section>

      <section>
        <h2>3. The Service</h2>
        <p>
          Garden helps people and AI agents collaborate through chat, issues,
          documents, automations, approvals, skills, and connected services. We
          may add, change, or discontinue features as the Service develops. We
          aim to give reasonable notice when a material change will
          significantly reduce a core paid feature, but early or experimental
          features may change without notice.
        </p>
        <p>
          You are responsible for your internet access, devices, workspace
          configuration, backups of information you cannot afford to lose, and
          compliance with laws and policies that apply to your use.
        </p>
      </section>

      <section>
        <h2>4. AI agents and automations</h2>
        <p>
          AI output is probabilistic and can be incomplete, inaccurate, or
          unsuitable. Agents can take actions through tools and connected
          accounts when permissions allow. You are responsible for configuring
          permissions, reviewing material output, and applying human judgment
          before relying on or publishing results or allowing consequential
          actions.
        </p>
        <p>
          Do not treat Garden output as a substitute for professional legal,
          financial, medical, employment, safety, or other regulated advice. You
          must independently verify information and obtain qualified advice when
          the stakes require it. You remain responsible for decisions and
          actions taken through your account, including agent and automation
          actions you authorize.
        </p>
      </section>

      <section>
        <h2>5. Connected services</h2>
        <p>
          Garden may let you connect third-party services such as GitHub,
          Google, Discord, Slack, model providers, or MCP servers. Your use of
          those services is governed by their terms and privacy policies. You
          authorize Garden to exchange information with them as needed to
          provide the features you enable.
        </p>
        <p>
          You must have authority to connect an account and grant each requested
          permission. We are not responsible for third-party services, their
          availability, or changes they make. Disconnecting a service may not
          delete information already sent to or received from it.
        </p>
      </section>

      <section>
        <h2>6. Your content</h2>
        <p>
          You retain ownership of content you submit to Garden and output you
          may own under applicable law (“Your Content”). You grant us a
          worldwide, non-exclusive, royalty-free license to host, copy, process,
          transmit, display, and modify Your Content only as reasonably
          necessary to operate, secure, support, and improve the Service and to
          follow your instructions. This license lasts while the content is
          stored by the Service and for limited backup, legal, and security
          retention afterward.
        </p>
        <p>
          You represent that you have the rights and permissions needed to
          submit Your Content and permit its processing. You are responsible for
          Your Content, including personal information, confidential material,
          and instructions given to agents. AI output may not be unique, and
          other users may receive similar output. We do not promise that output
          is protectable by intellectual-property law or free of third-party
          rights.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You may not use the Service to:</p>
        <ul>
          <li>break the law or violate another person’s rights;</li>
          <li>
            create, upload, or distribute malware or facilitate unauthorized
            access, phishing, fraud, harassment, exploitation, or violence;
          </li>
          <li>
            probe, scan, disrupt, overload, or bypass security, permissions,
            rate limits, or access controls, except under a written authorized
            security-testing program;
          </li>
          <li>
            access another account, workspace, system, or data without
            authorization;
          </li>
          <li>
            use Garden to make solely automated high-impact decisions about a
            person in employment, housing, credit, insurance, education, health,
            legal services, or similar contexts without lawful authority,
            appropriate safeguards, and meaningful human review;
          </li>
          <li>
            infringe intellectual-property, privacy, publicity, confidentiality,
            or data-protection rights; or
          </li>
          <li>
            resell or provide the Service to third parties unless we have agreed
            in writing.
          </li>
        </ul>
        <p>
          You may conduct good-faith research on Garden’s open-source code under
          its license. Testing the hosted Service still requires authorization
          and must not risk other users or systems.
        </p>
      </section>

      <section>
        <h2>8. Our software and intellectual property</h2>
        <p>
          We and our licensors retain all rights in the Service, including its
          branding, design, documentation, and software, except for Your Content
          and rights expressly granted under an open-source license. Garden’s
          source code is separately available under the license included with
          that code. The open-source license governs your use of the source
          code; these Terms govern your use of the hosted Service.
        </p>
        <p>
          If you provide feedback, you grant us a perpetual, worldwide,
          irrevocable, royalty-free right to use it without restriction or
          compensation, provided we do not identify you publicly as its source
          without permission.
        </p>
      </section>

      <section>
        <h2>9. Fees</h2>
        <p>
          Some features may be free, experimental, or offered under a separate
          order or plan. If we introduce a charge, we will show the price and
          applicable billing terms before you authorize payment. Taxes, provider
          usage charges, and third-party fees may apply. Terms in an executed
          order form control if they conflict with this section.
        </p>
      </section>

      <section>
        <h2>10. Privacy</h2>
        <p>
          Our <a href="/privacy">Privacy Policy</a> explains how we handle
          personal information. You are responsible for providing any notices,
          obtaining permissions, and establishing any processing terms required
          for personal information you place in a workspace or send to connected
          services.
        </p>
      </section>

      <section>
        <h2>11. Suspension and termination</h2>
        <p>
          You may stop using the Service at any time. Workspace administrators
          may remove members or delete organization-controlled content. To
          request closure of an account you cannot close in the product, contact
          us.
        </p>
        <p>
          We may limit, suspend, or terminate access if you materially breach
          these Terms, create security or legal risk, fail to pay an authorized
          charge, or use the Service in a way that could harm Garden, our
          providers, or others. When practical, we will give notice and an
          opportunity to fix the issue. We may act immediately for urgent risk
          or legal requirements.
        </p>
        <p>
          On termination, your right to use the Service ends. Provisions that by
          their nature should survive—including ownership, disclaimers,
          liability limits, indemnity, and dispute terms—will survive.
        </p>
      </section>

      <section>
        <h2>12. Disclaimers</h2>
        <p>
          To the maximum extent permitted by law, the Service is provided “as
          is” and “as available.” Flow Research and its suppliers disclaim all
          warranties, express, implied, or statutory, including merchantability,
          fitness for a particular purpose, title, non-infringement, accuracy,
          and uninterrupted or error-free operation. We do not warrant AI
          output, connected services, or that the Service will meet every
          requirement. Nothing in these Terms excludes a warranty that cannot
          legally be excluded.
        </p>
      </section>

      <section>
        <h2>13. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Flow Research and its
          suppliers will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits,
          revenue, goodwill, data, or business interruption, arising from or
          related to the Service, even if advised that such loss was possible.
        </p>
        <p>
          Our total liability for all claims arising from or related to the
          Service will not exceed the greater of (a) the amount you paid Flow
          Research for the Service during the 12 months before the event giving
          rise to the claim or (b) US$100. These limits do not apply where
          prohibited by law or to liability that cannot legally be limited.
        </p>
      </section>

      <section>
        <h2>14. Indemnity</h2>
        <p>
          To the extent permitted by law, if you use the Service for an
          organization, that organization will defend and indemnify Flow
          Research and its personnel against third-party claims, damages, and
          reasonable costs arising from Your Content, its use of the Service, or
          its violation of these Terms or another person’s rights. This section
          does not require an individual consumer to indemnify us where the law
          prohibits it.
        </p>
      </section>

      <section>
        <h2>15. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws applicable to Flow Research as
          operator of the Service, without regard to conflict-of-law rules.
          Courts with jurisdiction over Flow Research will have exclusive
          jurisdiction, except where mandatory consumer law gives you the right
          to bring a claim elsewhere. Before filing a formal claim, each party
          agrees to make a reasonable good-faith effort to resolve the dispute
          informally. Nothing here prevents either party from seeking urgent
          injunctive relief.
        </p>
      </section>

      <section>
        <h2>16. Changes to these Terms</h2>
        <p>
          We may update these Terms as the Service or law changes. We will post
          the revised Terms with a new effective date. For material changes, we
          will provide reasonable additional notice through the Service or by
          email. Unless a different date is stated, changes take effect when
          posted. Continued use after the effective date means you accept the
          revised Terms; if you do not agree, stop using the Service.
        </p>
      </section>

      <section>
        <h2>17. General</h2>
        <p>
          These Terms, the Privacy Policy, and any applicable order form are the
          entire agreement about the hosted Service. If a provision is
          unenforceable, it will be narrowed to the minimum extent necessary and
          the rest will remain effective. A failure to enforce a provision is
          not a waiver. You may not assign these Terms without our consent; we
          may assign them as part of a reorganization, financing, merger, sale,
          or transfer of the Service. We are not liable for delay caused by
          events beyond our reasonable control.
        </p>
      </section>

      <section>
        <h2>18. Contact</h2>
        <p>
          Questions about these Terms can be sent through the “Start a
          conversation” contact at{' '}
          <a href="https://flowresearch.tech/">flowresearch.tech</a>. Do not
          post confidential account or workspace information in a public GitHub
          issue.
        </p>
      </section>
    </LegalDocument>
  )
}
