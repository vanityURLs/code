# 0005. Support deferred legal pages

Date: 2026-05-22

Status: Accepted

## Context

New users need a fast phase-1 path to get a redirector online. Full privacy, terms, and standalone security pages
require operator-specific legal decisions that may take longer.

At the same time, a public short-link domain still needs abuse and vulnerability contact paths early.

## Decision

Setup supports deferring full privacy, terms, and standalone security pages with `operator.legal_pages_enabled`.

When full legal pages are deferred:

- Trust & Safety still deploys
- `/.well-known/security.txt` still deploys when security contact data is valid
- privacy, terms, and standalone security pages are skipped until configured

## Consequences

- Quickstart remains focused on first deployment
- Operators can publish basic trust contact paths before finishing full legal review
- Full legal pages still require operator, jurisdiction, contact, and date fields
- Setup can be rerun later to enable the full page set
