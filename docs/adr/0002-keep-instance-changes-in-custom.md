# 0002. Keep instance-owned changes in custom

Date: 2026-05-19

Status: Accepted

## Context

vanityURLs instances need to receive product updates without overwriting local links, policies, branding, and operator settings.

The repository contains product-owned defaults and scripts, instance-owned custom files, and generated build output.

## Decision

Product-owned files live under `defaults/` and `scripts/`.

Instance-owned files live under `custom/`.

Generated output lives under `build/` and `src/`.

The build copies product defaults, overlays `custom/`, then writes generated runtime artifacts. Instance owners should edit `custom/`, not `defaults/` or `build/`, unless they are contributing product changes upstream.

## Consequences

- Instances can upgrade product files while preserving local configuration
- `custom/` is the operational boundary for links, policies, site config, public overrides, and local helper settings
- Build output can be deleted and regenerated
- Documentation can refer to source files without turning generated artifacts into edit targets
