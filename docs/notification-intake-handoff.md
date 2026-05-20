# Notification Intake Handoff

This note consolidates the Trust & Safety notification intake initiative so a future Codex instance can pick it up without replaying the whole discussion.

## Context

The vanityURLs redirector now publishes operator-specific legal pages and Trust & Safety contact information from `custom/v8s-site-config.json`.

Current redirector responsibilities:

- Generate localized default Terms and Trust & Safety pages.
- Publish `/.well-known/security.txt` and `/security.txt` from complete `operator.*` configuration.
- Keep `/abuse` working as a compatibility alias.
- Prefer `/trust-safety` as the human-facing English Trust & Safety URL.
- Provide `defaults/public/abuse-report.md` as a copy/paste fallback template.

Current operator config fields relevant to intake:

- `operator.legal_name`
- `operator.short_domain`
- `operator.jurisdiction`
- `operator.governing_law`
- `operator.contact_email`
- `operator.privacy_contact`
- `operator.abuse_contact`
- `operator.security_contact`
- `operator.last_updated`
- `operator.analytics_disclosure`
- `operator.analytics_retention`
- `operator.abuse_response_window`

## Product Decision

Build notification intake as a separate open source project, not inside the redirector Worker.

Reasoning:

- Form intake is a different operational surface than redirects.
- It needs validation, spam controls, rate limits, delivery integrations, secrets, and possibly attachment or evidence handling.
- Keeping it separate avoids turning the redirector Worker into a mixed-purpose application.
- The redirector should publish policy pages and link to intake channels; the notification project should receive and route reports.

Suggested repository:

- `vanityURLs/notifications`
- Alternative: `vanityURLs/intake`

Suggested hostnames:

- `notification.vanityurls.link/forms/abuse`
- `notification.vanityurls.link/forms/security`
- `notification.vanityurls.link/forms/contact`

Shorter aliases are fine too:

- `notification.vanityurls.link/abuse`
- `notification.vanityurls.link/security`
- `notification.vanityurls.link/legal`

## Recommended Redirector Integration

Keep `/trust-safety` as the explanation and policy page.

Do not make `/abuse` redirect directly to the intake form by default. The policy page gives context, sets expectations, points to authorities for CSAM or imminent harm, and explains security disclosure scope.

Add optional URL fields to `operator` later:

```json
{
  "operator": {
    "abuse_report_url": "https://notification.vanityurls.link/forms/abuse",
    "security_report_url": "https://notification.vanityurls.link/forms/security",
    "legal_contact_url": "https://notification.vanityurls.link/forms/legal"
  }
}
```

Rendering rule:

- If `operator.abuse_report_url` exists, Trust & Safety links visitors to the form and keeps `operator.abuse_contact` as fallback email.
- If `operator.security_report_url` exists, Security/Trust & Safety pages link to the security form and keep `operator.security_contact` as fallback email.
- `/.well-known/security.txt` should still publish a stable `Contact:` line. Email remains the safest default for RFC 9116 compatibility, though an HTTPS form URL can be added as an additional `Contact:` line later if desired.

Optional direct shortcuts in the redirector:

- `/report-abuse` -> `operator.abuse_report_url`
- `/report-security` -> `operator.security_report_url`

These should be explicit generated links or routes only when the corresponding URL is configured.

## Notification Worker Scope

The notification project should provide a Cloudflare Worker-based form intake service.

Core behavior:

- Serve form pages for abuse, security, and optional legal/contact report types.
- Validate required fields.
- Apply Cloudflare protections: WAF, bot fight mode or Turnstile, rate limiting, and managed challenge rules.
- Send the report to configured destinations such as Slack webhook, email provider, generic webhook, or issue tracker.
- Return a confirmation page with a report reference.
- Avoid storing submissions by default unless explicitly configured.

Suggested report fields for abuse:

- Short URL.
- Destination reached.
- Report category.
- Description.
- Observed date/time.
- Reporter email.
- Screenshots or evidence URL, optional.
- Confirmation checkbox that sensitive personal information is not included unless necessary.

Suggested report fields for security:

- Affected URL or component.
- Vulnerability type.
- Impact.
- Reproduction steps.
- Suggested remediation, optional.
- Reporter name/handle, optional.
- Reporter email.
- Disclosure preference and credit preference.

Delivery integrations:

- Slack incoming webhook.
- Email provider such as MailChannels, Resend, Postmark, SendGrid, or Cloudflare Email Routing plus Worker-compatible outbound email if available.
- Generic webhook.

Secrets/config candidates:

- `SLACK_WEBHOOK_URL`
- `REPORT_EMAIL_TO`
- `REPORT_EMAIL_FROM`
- `EMAIL_PROVIDER_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `INTAKE_SIGNING_SECRET`

Public config candidates:

- `PUBLIC_BASE_URL`
- `INSTANCE_NAME`
- `SUPPORTED_REPORT_TYPES`
- `MAX_BODY_BYTES`
- `ALLOW_ATTACHMENTS`
- `PRIVACY_NOTICE_URL`
- `TRUST_SAFETY_URL`

## Security And Privacy Guardrails

- Do not collect more data than needed.
- Avoid attachments in the first version; allow evidence URLs instead.
- Add size limits and strict content-type handling.
- Sanitize and escape all submitted content before rendering.
- Treat all submissions as untrusted.
- Never log full report bodies by default.
- Add a simple reference ID but do not expose internal Slack/email delivery IDs.
- Make retention explicit if storage is added later.
- Keep security reports private by design.

## Open Questions

- Should the first implementation be no-storage delivery only, or should it store encrypted copies in KV/D1/R2?
- Which email provider should be the default recommendation?
- Should Turnstile be required for all forms or only public deployments?
- Should `security.txt` include both email and form `Contact:` lines when `security_report_url` exists?
- Should the redirector add `/report-abuse` and `/report-security` helper aliases, or should links live only inside Trust & Safety content?
- Should the notification project support multi-tenant forms from the start, or one Worker per operator?

## Suggested Implementation Phases

1. Scaffold a new Worker project with static form pages and a POST endpoint.
2. Add schema validation and report-type-specific required fields.
3. Add Turnstile verification.
4. Add Slack webhook delivery.
5. Add email delivery.
6. Add confirmation/reference IDs.
7. Add README deployment guide and example Cloudflare protections.
8. Return to the redirector and add optional `operator.*_report_url` fields plus rendering support.

## Prompt For Next Codex Instance

Use this prompt in a fresh Codex instance next week:

```text
We are starting a new open source vanityURLs notification intake initiative. The redirector repo is at /Volumes/Tarmac/code/vanityURLs/code and currently handles redirects, generated legal pages, Trust & Safety content, and security.txt. Do not put form intake logic into the redirector Worker unless explicitly needed for config integration.

Please create or work in a separate project for a Cloudflare Worker form intake service, tentatively vanityURLs/notifications. The goal is to receive abuse and security reports through protected forms hosted at URLs like https://notification.vanityurls.link/forms/abuse and https://notification.vanityurls.link/forms/security.

Read /Volumes/Tarmac/code/vanityURLs/code/docs/notification-intake-handoff.md first. Follow its architecture decisions:
- redirector publishes policy pages and links to intake channels;
- notification Worker owns form rendering, POST validation, anti-abuse controls, and delivery integrations;
- no storage by default unless explicitly configured;
- Slack webhook and email delivery should be first-class destinations;
- Turnstile and Cloudflare network protections should be supported;
- generated reports must be sanitized, size-limited, and treated as untrusted;
- security reports should remain private.

Start by proposing the project structure and minimal Worker implementation. Then implement the first useful version: abuse and security forms, POST endpoints, validation, Turnstile hook, Slack webhook delivery, local tests, and deployment documentation. If you need to touch the redirector later, add only optional config fields such as operator.abuse_report_url and operator.security_report_url and keep email fallbacks intact.

When making changes, use conventional commits and push to GitHub when the work is ready, matching the existing vanityURLs workflow.
```

