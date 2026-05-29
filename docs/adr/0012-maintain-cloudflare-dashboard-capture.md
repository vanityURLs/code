# 0012. Maintain Cloudflare dashboard capture for protection guidance

Date: 2026-05-29

Status: Accepted

## Context

vanityURLs production setup depends on Cloudflare dashboard settings whose names, locations, defaults, and plan
availability can change over time.

The public documentation explains the operator workflow, but prose alone makes it difficult to compare future Cloudflare
captures against the baseline. Some dashboard surfaces are deliberately not setup requirements, such as Cloudflare Web
Analytics RUM, Cache Rules, Bulk Redirects, and optional diagnostics. They still matter during future audits because a
setting may be renamed, moved, enabled by default, or become relevant to the product.

## Decision

Maintain the structured Cloudflare dashboard capture in the website repository as the assessment source for protection
guidance.

When Cloudflare posture guidance changes, update the capture data when pertinent, including:

- newly observed dashboard settings, menu labels, defaults, quotas, or plan gates
- settings that are documented as baseline requirements
- settings that are explicitly documented as not required or reference-only
- renamed settings that affect operator instructions
- captured values that help compare a future fresh-zone setup with the documented baseline

Keep public documentation focused on the operator path. Move non-baseline operational detail to reference pages when it
helps maintainers without making the setup checklist feel like mandatory configuration.

ADRs remain in the code repository. The website may link to an ADR or to the structured capture when a decision needs
durable context.

## Consequences

- Future Cloudflare UI reviews can compare structured data instead of relying on memory or screenshots alone.
- Documentation updates should consider both prose and the data capture.
- Reference-only Cloudflare surfaces can stay discoverable without becoming required setup steps.
- Product decisions about runtime behavior still need their own ADR when they change code or instance contracts.
