# 0011. Use Prettier and a single check gate

Date: 2026-05-26

Status: Accepted

## Context

vanityURLs includes JavaScript, JSON, Markdown, HTML, CSS, TOML, and YAML files. Before this decision, the repository
had custom linting and tests, but no automatic formatter. Formatting drift could show up late, and CI could not enforce
the same style that maintainers use locally.

The project also needs one obvious command for local verification and CI/CD. Instance owners should not need to remember
separate format, build, lint, and test commands before pushing.

## Decision

Use Prettier as the automatic formatter for supported text files.

Expose two explicit formatting commands:

- `npm run format` rewrites supported files with Prettier
- `npm run format:check` verifies that supported files already match Prettier output

Keep `scripts/lint.mjs` as the project-specific lint layer for checks Prettier does not cover, including trailing
newlines, JSON parse errors, JavaScript syntax checks, and vanityURLs-specific `wrangler.toml` expectations.

Make `npm run check` the single local and CI gate. It runs, in order:

1. `npm run format:check`
2. `node scripts/build.mjs`
3. `npm run lint`
4. `npm test`

The GitHub Actions check workflow runs `npm ci` followed by `npm run check`.

## Consequences

- Formatting is deterministic locally and in CI
- Maintainers can run `npm run format` before committing noisy style changes
- `npm run check` remains the one command to run before pushing
- Prettier does not replace project-specific linting or runtime tests
- The installer can run the same check gate quietly and show a concise setup result
