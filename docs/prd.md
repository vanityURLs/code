# Mailroom Product Requirements Document

## Working Title

Mailroom is a Cloudflare Worker-based form intake service for operational reports and requests.

Mailroom is the current project name. Public URLs and page labels should use naming that visitors understand and trust, such as report, notification, abuse, security, privacy, trust, or contact language depending on the operator and report type.

## Context

Every operator needs predictable, trustworthy forms to receive ad hoc information related to abuse, security vulnerabilities, privacy requests, accessibility, internationalization, website feedback, meeting requests, and similar operational workflows.

Form intake is a different operational surface than redirects. It needs validation, spam controls, rate limits, delivery integrations, secrets, and possibly attachment or evidence handling. Mailroom should follow the same general operational philosophy as vanityURLs: each operator runs their own instance, owns its configuration, and deploys it on their own hostname. A typical hostname is `notification.<operator-domain>`, for example `notification.dicaire.com`.

Mailroom is not a public marketing website. It is a form handler with a minimal web surface, server-rendered HTML, and no client-side JavaScript in the core experience.

## Goals

- Provide an easy, predictable way for visitors to submit operational reports and requests.
- Provide a report reference or ticket number so the reporter knows the information was received and transmitted.
- Notify configured stakeholders reliably.
- Record enough operational metadata and timestamps to support non-repudiation without collecting unnecessary personal data.
- Keep submitted content private by design.
- Avoid storing submissions by default unless storage is explicitly configured.
- Support independent, self-hosted instances for each operator.
- Support localization from the beginning, initially English and French.
- Use the same Hugo structure as the vanityURLs website for marketing and documentation.

## Non-Goals

- Mailroom is not a CRM, help desk, or long-term case management system in the first version.
- Mailroom will not expose a broad public API in the first version.
- Mailroom will not support attachments in the first version.
- Mailroom will not store report bodies by default.
- Mailroom will not depend on client-side JavaScript for core form submission.

## Primary Use Cases

- Abuse report.
- Security vulnerability report.
- Privacy request.
- Accessibility report.
- Internationalization or localization feedback.
- Website, article, post, or documentation feedback.
- Meeting request.
- DMCA takedown request.
- Optional legal or contact report types.

## Core Behavior

- Serve form pages for abuse, security, and optional legal/contact report types.
- Serve multiple report-type forms in version 1 to prove the intake engine supports distinct use cases.
- Validate required fields.
- Apply Cloudflare protections such as WAF, Bot Fight Mode, Turnstile, rate limiting, and managed challenge rules.
- Send reports to configured destinations such as Slack webhook, email provider, generic webhook, or issue tracker.
- Return a confirmation page with a report reference.
- Avoid storing submissions by default unless explicitly configured.
- Publish generated legal and operational pages.
- Publish `/.well-known/security.txt`, `robots.txt`, and the two `llms` files defined in vanityURLs.
- Avoid encouraging harvesting of endpoint metadata.

## Security Principles

Mailroom should explicitly support these five core security principles:

- Confidentiality: information is accessible only to authorized users and protected from unauthorized disclosure.
- Integrity: submitted data and operational metadata remain accurate, complete, and protected from unauthorized modification.
- Availability: authorized users can reliably access the form handler and receive reports when needed.
- Authenticity: users, systems, and data sources can be evaluated as genuine and trustworthy where appropriate.
- Non-repudiation: submission, delivery, and handling events include enough evidence, timestamps, and references to discourage denial of action.

## User Experience Principles

- Filling out a form should be easy and predictable.
- The confirmation page should clearly show the report reference.
- Report references should be short, human-friendly, opaque IDs with a date prefix, such as `MR-20260523-8X4K2P`.
- The confirmation page must not reflect untrusted content back to the user.
- The reporter should understand what data is required and what should not be included.
- Forms should ask for the least information needed for the report type.
- Evidence URLs are preferred over file uploads in the first version.

## Build Principles

- Use conventional commits.
- Maintain a well-known file structure and organization.
- Keep text-based source material in Markdown so it can be converted into other formats when required.
- Use linting throughout the build to reduce surprises.
- Store secrets initially in 1Password, then use them in memory or Cloudflare-managed secret/configuration mechanisms.
- Prefer Node.js 20 or newer, npm, and git because they work locally on Linux, Windows, macOS, and Cloudflare Workers.
- Test code as early as possible.
- Document code and user-facing behavior in the codebase and on the website.
- Design for internationalization from the beginning.
- Begin with English and French.
- Fall back to English when a localized page is not available for the requested ISO language code.
- Detect browser language from the request and serve localized content when available.
- Detect whether the endpoint is currently in light or dark mode and serve the appropriate colorset and images.

## Initial Report Types

### Abuse Report

Suggested fields:

- Short URL.
- Destination reached.
- Report category.
- Description.
- Observed date/time.
- Reporter email.
- Screenshots or evidence URL, optional.
- Confirmation checkbox that sensitive personal information is not included unless necessary.

### Security Report

Suggested fields:

- Affected URL or component.
- Vulnerability type.
- Impact.
- Reproduction steps.
- Suggested remediation, optional.
- Reporter name or handle, optional.
- Reporter email.
- Disclosure preference.
- Credit preference.

### DMCA Takedown Report

Suggested fields:

- URL or content location.
- Original copyrighted work location.
- Rights holder name.
- Reporter name.
- Reporter email.
- Reporter role or authority to act.
- Description of alleged infringement.
- Good-faith belief confirmation.
- Accuracy and authority confirmation.
- Electronic signature.
- Optional evidence URL.

## Delivery Integrations

One primary destination is selected per deployment. First-class destination candidates:

- Slack incoming webhook.
- Email provider.
- Generic webhook.

Email provider candidates:

- MailChannels.
- Resend.
- Postmark.
- SendGrid.
- Cloudflare Email Routing plus Worker-compatible outbound email if available.

Default email recommendation is undecided. Resend is available for low-volume deployments, but Cloudflare-native delivery is preferred if viable and if the privacy impact is acceptable.

Future destination candidates:

- Issue tracker.
- Incident management system.
- Case management system.

## Secrets And Configuration

### Secret Config Candidates

- `SLACK_WEBHOOK_URL`
- `REPORT_EMAIL_TO`
- `REPORT_EMAIL_FROM`
- `EMAIL_PROVIDER_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `INTAKE_SIGNING_SECRET`

### Public Config Candidates

- `PUBLIC_BASE_URL`
- `INSTANCE_NAME`
- `SUPPORTED_REPORT_TYPES`
- `MAX_BODY_BYTES`
- `ALLOW_ATTACHMENTS`
- `PRIVACY_NOTICE_URL`
- `TRUST_SAFETY_URL`
- `PRIMARY_DESTINATION`
- `TURNSTILE_POLICY`

## Security And Privacy Guardrails

- Do not collect more data than needed.
- Avoid attachments in the first version; allow evidence URLs instead.
- Add size limits and strict content-type handling.
- Sanitize and escape all submitted content before rendering.
- Treat all submissions as untrusted.
- Never log full report bodies by default.
- Add a simple reference ID but do not expose internal Slack or email delivery IDs.
- Make retention explicit if storage is added later.
- Keep security reports private by design.

## Threat Model

Mailroom accepts untrusted input from the open internet and must be designed as a CISO-grade operational service.

### Trust Boundaries

- Public visitor to Cloudflare edge.
- Cloudflare edge protections to Worker runtime.
- Worker runtime to configured delivery integrations.
- Worker runtime to optional storage, if added later.
- Operator configuration and secrets to runtime environment.
- Confirmation page rendering to reporter.
- Report delivery to stakeholder systems.

### Abuse Scenarios

- Form spam and automated bulk submissions.
- Evidence-link weaponization, including malicious URLs submitted as proof.
- Reflected content on confirmation pages.
- Slack webhook leak through misconfiguration or accidental logging.
- Email provider API key leak through misconfiguration or accidental logging.
- Oversized body submissions intended to consume runtime resources.
- Content-type confusion or malformed form submissions.
- Submission of sensitive personal information that is not required.
- Reports that attempt to inject markup, Markdown, Slack formatting, or email headers.
- Enumeration of report references.
- Misuse of public endpoints as a generic relay to Slack, email, or webhooks.

### Accepted Mitigations

- Use Cloudflare WAF, rate limiting, managed challenges, Bot Fight Mode, and Turnstile where appropriate.
- Require strict method, path, content-type, and body-size handling.
- Validate report-type-specific schemas before delivery.
- Escape and sanitize submitted content before rendering or formatting it for any destination.
- Never render submitted report bodies on confirmation pages.
- Keep report references simple for reporters but separate from destination delivery IDs.
- Do not log full report bodies by default.
- Keep attachments out of the first version.
- Treat evidence URLs as untrusted text and do not fetch them server-side in the first version.
- Keep secrets in Cloudflare secret mechanisms and local 1Password workflows.
- Sign or authenticate outbound webhooks when possible.

## Architecture Decisions

- The vanityURLs Worker publishes policy pages and links to intake channels.
- The Mailroom Worker owns form rendering, POST validation, anti-abuse controls, and delivery integrations.
- Version 1 starts as no-storage delivery only to accelerate development and testing.
- Encrypted storage in KV, D1, or R2 is a priority roadmap item.
- Slack webhook and email delivery are first-class destinations.
- One primary delivery destination is configured per deployment.
- Turnstile is configurable per deployment or through a global instance policy.
- Generated reports are sanitized, size-limited, and treated as untrusted.
- Each Worker serves one operator; multi-tenant routing is not part of version 1.
- Redirector integration, if needed later, should add only optional fields such as `operator.abuse_report_url` and `operator.security_report_url` while keeping email fallbacks intact.

## Open Architecture Questions

- Which email provider should be the default recommendation?
- Should `security.txt` include both email and form `Contact:` lines when `security_report_url` exists?
- Should the redirector add `/report-abuse` and `/report-security` helper aliases, or should links live only inside Trust & Safety content?
- Should the v1 launch include privacy, accessibility, internationalization, feedback, and meeting forms, or should those follow after abuse, security, and DMCA prove the engine?
- What exact report reference format should be treated as canonical?

## Suggested Implementation Phases

1. Scaffold a new Worker project with static form pages and a POST endpoint.
2. Add schema validation and report-type-specific required fields.
3. Add Turnstile verification.
4. Add Slack webhook delivery.
5. Add email delivery.
6. Add confirmation/reference IDs.
7. Add README deployment guide and example Cloudflare protections.
8. Return to the Worker and add optional `operator.*_report_url` fields plus rendering support.
9. Document data collected, retention, and how Law 25, PIPEDA, and GDPR apply.

## First Useful Version

The first useful implementation should include:

- Abuse and security forms.
- DMCA takedown form.
- POST endpoints.
- Server-side validation.
- Turnstile verification hook.
- Slack webhook delivery.
- Configurable primary delivery destination.
- Local tests.
- Deployment documentation.

## Related Repositories And Deployments

- Mailroom code: `/Volumes/Tarmac/code/bhdicaire/mailroom-code`
- Mailroom documentation: `/Volumes/Tarmac/code/bhdicaire/mailroom-website`
- Mailroom deployment: `https://mr.dicaire.com`
- Mailroom docs deployment: `https://docs.mr.dicaire.com`
- vanityURLs code reference: `/Volumes/Tarmac/code/vanityurls/code`
- vanityURLs website reference: `/Volumes/Tarmac/code/vanityurls/website`

## Documentation Website Direction

The Mailroom marketing and documentation website should be similar to `www.vanityURLs` and should use the same Hugo structure. Documentation should cover:

- Concepts and threat model.
- Deployment.
- Configuration.
- Cloudflare protections.
- Delivery integrations.
- Internationalization.
- Privacy and retention.
- Legal and operational pages.
- Local development.
- Testing.

## Clarification Log

- 2026-05-23: Mailroom remains the project name, but public URLs and labels should use visitor-trust language rather than project-internal naming when appropriate.
- 2026-05-23: Version 1 starts with no storage to accelerate development and testing; encrypted storage remains a priority roadmap item.
- 2026-05-23: Resend is available for low-volume email delivery, but Cloudflare-native delivery is preferred if viable and if the privacy impact is acceptable.
- 2026-05-23: Turnstile is configurable per deployment or via global instance policy.
- 2026-05-23: Version 1 supports one operator per Worker.
- 2026-05-23: Recommended report reference format is a human-friendly opaque ID with date prefix, for example `MR-20260523-8X4K2P`.
- 2026-05-23: Version 1 should support multiple form types to prove the intake engine, starting with abuse, security, and DMCA takedown.
- 2026-05-23: Each deployment should use one primary delivery destination.
