# Schema changelog

This changelog records field-level schema changes for vanityURLs configuration files, including additive changes that do not bump `schema_version`.

`schema_version` is reserved for incompatible stored-config changes that need migration. See `docs/adr/0002-site-config-schema-versioning.md`.

## 2026-05-26

### v8s-site-config.json

Added optional field under `operator`:

- `operator_domain`

Compatibility: additive, no `schema_version` bump

Migration: none required. When `operator.operator_domain` is blank or absent, setup defaults role-based email addresses from the short domain. When it is set, setup defaults operator, privacy, Trust & Safety, and security email addresses from the operator domain.

### v8s-site-config.json

Added optional fields under `links`:

- `random_slug_length`
- `random_slug_alphabet`
- `tag_random_slug_lengths`

Compatibility: additive, no `schema_version` bump

Migration: none required. `lnk` reads missing values from `defaults/v8s-site-config.json`.

### v8s-site-config.json

Added installer-managed branding fields:

- `branding.domain`
- `branding.slogan`
- `branding.custom_public`
- `branding.wordmark.black`
- `branding.wordmark.green`

Compatibility: additive, no `schema_version` bump

Migration: none required. Existing instances without `branding` continue to use default public assets or custom public files.

### v8s-site-config.json

Added deferred legal-page mode:

- `operator.legal_pages_enabled`

Compatibility: additive, no `schema_version` bump

Migration: none required. Missing values behave like enabled legal pages only when the operator fields are fully configured.

### v8s-site-config.json

Expanded operator fields used by generated privacy, terms, Trust & Safety, security, and `security.txt` output:

- `operator.legal_name`
- `operator.short_domain`
- `operator.jurisdiction`
- `operator.governing_law`
- `operator.contact_email`
- `operator.privacy_contact`
- `operator.abuse_contact`
- `operator.security_contact`
- `operator.last_updated`
- `operator.umami_geo_ip_mode`
- `operator.analytics_disclosure`
- `operator.analytics_retention`
- `operator.abuse_response_window`

Compatibility: additive, no `schema_version` bump

Migration: none required for plain redirect behavior. Generated legal pages require the relevant fields before launch.

### v8s-local-config.json

Added local helper and local publish configuration:

- `shell_helper`
- `lnk_cli`
- `local_publish`
- `registry`
- `repository`

Compatibility: additive, no `schema_version` bump

Migration: none required. `npm run local-install` writes workstation-specific values.

### v8s-policies.json

Replaced legacy blocklist naming with the broader policy source:

- `defaults`
- `allow_domains`
- `blocked_keywords`
- `block_domains`
- optional `generated_sources`

Compatibility: additive and rename-compatible, no `schema_version` bump

Migration: legacy `v8s-blocklist.json` filenames are still recognized for migration compatibility, but new instances should use `v8s-policies.json`.

### v8s-schedules.json

Added schedule configuration keyed by slug:

- `timezone`
- `default`
- shortcut rules such as `9to5`
- `rules[]` entries with `label`, `timezone`, `days`, `from`, `to`, and `target`

Compatibility: additive, no `schema_version` bump

Migration: none required. Missing custom schedules mean the link uses its normal target.
