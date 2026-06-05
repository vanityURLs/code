# 0016. Adopt a complexity budget and refactor toward functional core

Date: 2026-06-04

Status: Accepted

## Context

The vanityURLs code repository has several large operational files. The largest files are not wrong because they are
large, but they mix orchestration, file system access, prompts, network calls, validation, and pure transformations in
the same modules. That makes growth hard to notice and makes focused unit testing harder than necessary.

The current `npm run lint` hygiene checker verifies formatting-adjacent repository rules, JSON validity, and JavaScript
syntax. It does not measure cyclomatic complexity, cognitive complexity, nesting depth, parameter count, or
file/function size.

## Decision

Add ESLint with a flat config and `eslint-plugin-sonarjs` as a complexity visibility layer. Wire it into `npm run lint`
and therefore into `npm run check`.

Use `npm run lint:complexity` for a concise summary and `npm run lint:complexity:raw` for the full ESLint output. The
summary command writes the complete warning/error data to `build/eslint-complexity-report.json`.

Initial complexity budgets are warning-level so the current repository stays green:

- cyclomatic complexity: 12
- cognitive complexity: 15
- maximum lines per file: 400
- maximum lines per function: 60
- maximum nesting depth: 4
- maximum parameters: 4

Treat these warnings as a ratchet. New code should stay inside the budget. Existing violations should be reduced when a
module is touched for related work. After large files are decomposed, tighten the rules or convert selected budgets from
warnings to errors.

Refactor large modules toward a functional-core, imperative-shell shape:

- keep file system, process, prompt, and network operations in thin orchestrators
- move pure transformations into `scripts/lib/**` or `scripts/workers/lib/**`
- test the pure modules directly
- decompose scripts by phase, such as build pipeline phases and install wizard phases

## Consequences

- `npm run check` now reports complexity growth without blocking current releases.
- Large files can be refactored incrementally instead of through a high-risk rewrite.
- The repository gains an objective signal for future refactoring priorities.
- Warning-only budgets require maintainer discipline until the ratchet is tightened.
