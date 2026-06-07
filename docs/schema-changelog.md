# Schema changelog

This changelog records field-level schema changes for vanityURLs configuration files, including additive changes that do
not bump `schema_version`.

`schema_version` is reserved for incompatible stored-config changes that need migration. See
`docs/adr/0008-site-config-schema-versioning.md`.

## 2026-05-26

### v8s-site-config.json

Added optional field under `operator`:

- `operator_domain`

Compatibility: additive, no `schema_version` bump

Migration: none required. When `operator.operator_domain` is blank or absent, setup defaults role-based email addresses
from the short domain. When it is set, setup defaults operator, privacy, Trust & Safety, and security email addresses
from the operator domain.

### v8s-site-config.json

Added optional fields under `links`:

- `random_slug_length`
- `random_slug_alphabet`
- `tag_random_slug_lengths`

Compatibility: additive, no `schema_version` bump

Migration: none required. Build and CLI config loading merge `defaults/v8s-site-config.json` with
`custom/v8s-site-config.json`, so missing link defaults are inherited from the product baseline.

### v8s-site-config.json

Added installer-managed branding fields:

- `branding.domain`
- `branding.slogan`
- `branding.custom_public`
- `branding.wordmark.black`
- `branding.wordmark.green`

Compatibility: additive, no `schema_version` bump

Follow-up: `branding.slogan` now supports localized slogan maps such as `{ "en": "...", "fr": "..." }`. Existing string
values remain valid and are treated as the English fallback.

Migration: none required. Existing instances without `branding` continue to use default public assets or custom public
files.

### v8s-site-config.json

Added deferred legal-page mode:

- `operator.legal_pages_enabled`

Compatibility: additive, no `schema_version` bump

Migration: none required. Missing values behave like enabled legal pages only when the operator fields are fully
configured.

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

- `schema_version`
- `shell_helper`
  - `enabled`
  - `install_path`
  - `rc_file`
- `lnk_cli`
  - `install_path`
- `v8s_fix_cli`
  - `install_path`
- `local_publish`
  - `commit_message`
  - `commit_messages.links`
  - `commit_messages.policies`
  - `commit_messages.site_config`
  - `commit_messages.mixed`
  - `paths`
- `registry`
  - `local_path`
- `repository`
  - `path`

Compatibility: additive, no `schema_version` bump

Migration: none required. `npm run local-install` writes workstation-specific values.

### v8s-policies.json

Replaced legacy blocklist naming with the broader policy source:

- `schema_version`
- `updated_at`
- `defaults`
  - `block_private_networks`
  - `block_localhost`
  - `block_auth_in_url`
  - `allowed_protocols`
  - `blocked_file_extensions`
- `allow_domains`
  - `domain`
  - `reason`
  - `source`
  - `added_at`
  - `enabled`
- `blocked_keywords`
  - `keyword`
  - `category`
  - `severity`
  - `reason`
  - `source`
  - `scope`
  - `added_at`
- `block_domains`
  - `domain`
  - `category`
  - `severity`
  - `reason`
  - `source`
  - `added_at`
- optional `generated_sources`
  - `url`
  - `type`
  - `category`
  - `severity`
  - `source`
  - `enabled`

Compatibility: additive and rename-compatible, no `schema_version` bump

Migration: legacy `v8s-blocklist.json` filenames are still recognized for migration compatibility, but new instances
should use `v8s-policies.json`. When a custom policy exists, it replaces the default source policy instead of merging
with it.

### v8s-links.txt inline schedules

Added inline schedule directives below link rows:

- `@schedule timezone=America/Toronto`
- `@schedule 9to5=https://example.com/open`
- `@schedule rule=work days=mon,tue,wed,thu,fri from=09:00 to=17:00 target=https://example.com/open`

Compatibility: additive, no stored-config `schema_version` bump. `v8s-schedules.json` remains readable as a deprecated
compatibility source during 3.x.

Migration: none required. Missing schedules mean the link uses its normal target.
