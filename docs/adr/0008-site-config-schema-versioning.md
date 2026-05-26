# 0008. Treat site config schema version as a stored contract

Date: 2026-05-26

Status: Accepted

## Context

`defaults/v8s-site-config.json` and `custom/v8s-site-config.json` include `schema_version`. The value has stayed at `1.0` while new optional fields were added, such as link CLI defaults and installer-managed branding fields.

Additive fields do not currently require instance owners to migrate existing files because the build and installer merge defaults with custom values and tolerate missing optional fields.

## Decision

Keep `schema_version` at `1.0` for additive, backward-compatible changes.

Increment `schema_version` only when a stored `custom/v8s-site-config.json` file needs a migration or when existing field semantics change incompatibly.

Record additive field changes in `docs/schema-changelog.md`, even when `schema_version` does not change.

When `schema_version` changes, the same change should include:

- the new default schema version in `defaults/v8s-site-config.json`
- installer or upgrade behavior that handles older custom files
- documentation in the related release notes or ADR
- tests or checks for the migration behavior when practical

## Consequences

- Instance owners are not asked to interpret schema bumps for optional fields
- Maintainers have a clear trigger for schema version changes
- The current `schema_version` remains useful as a future migration marker even though it is not bumped for every new field
- Source files remain the implementation contract for exact fields
