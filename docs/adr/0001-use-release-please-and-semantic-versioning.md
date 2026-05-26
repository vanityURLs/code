# 0001. Use release-please and semantic versioning

Date: 2026-05-15

Status: Accepted

## Context

vanityURLs is deployed by people who pull product updates into their own instance repositories. Those updates need
predictable version numbers, changelog entries, and release notes so instance owners can decide when to upgrade.

The code repository uses Conventional Commits for change intent. The repository also includes a GitHub Actions workflow
at `.github/workflows/release-please.yml`.

The code repository has `npm run lint`, implemented by `scripts/lint.mjs`, and `npm run check`, which runs formatting,
build, lint, and tests.

## Decision

Use release-please to automate release pull requests and tags from Conventional Commits.

Use semantic versioning for code releases:

- `fix:` produces patch releases
- `feat:` produces minor releases
- breaking changes produce major releases

Keep `.github/workflows/release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`,
`package.json`, and changelog output as product-release files in the upstream code repository.

Detached user instances should remove upstream release-please metadata with `npm run detach`, because instance
repositories should not publish vanityURLs product releases.

## Consequences

- Product releases are repeatable and tied to commit intent
- Instance owners can refer to release notes before upgrading
- Conventional Commits matter for release automation, not just readability
- Formatting, lint, build, and test automation exist through npm scripts
