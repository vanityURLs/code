# 0001. Record architecture decisions in the code repository

Date: 2026-05-26

Status: Accepted

## Context

vanityURLs has product behavior, generated configuration, installer behavior, and deployment assumptions that are easier to understand when the reason for a decision is close to the code that implements it.

The public website should explain how to use vanityURLs, but it should not become a long internal design log. Maintainers still need a lightweight place to record why code-level contracts exist.

## Decision

Record architecture decision records as Markdown files under `docs/adr/` in the code repository.

Use a small structure:

- title, date, and status
- context
- decision
- consequences

Number ADR files with a stable prefix, for example `0001-record-architecture-decisions.md`.

The website may link to an ADR or source file when the implementation detail matters, but ADRs are maintained in the code repository.

## Consequences

- Design history travels with the code
- Website pages can stay short and user-focused
- Changes to product contracts can reference a local ADR in the same pull request or commit
- ADRs are not a replacement for user documentation, tests, or inline code comments
