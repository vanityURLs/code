# 0018. Keep managed public assets in defaults

Date: 2026-06-15

Status: Accepted

## Context

The build publishes public files by copying `defaults/public/` first and then overlaying `custom/public/`. That makes
custom HTML pages and instance-owned assets easy to maintain without editing upstream defaults.

Product-owned runtime assets, however, also live in the public surface. Files such as `v8s-style.css`, `v8s-script.js`,
`v8s-lookup.js`, `v8s-stats.js`, `v8s-status.css`, `v8s-tests.js`, and `v8s-theme.js` are part of the release package.
Copying them into `custom/public/` turns them into local shadows. Those shadows can keep serving stale product
JavaScript or CSS after an upgrade, and they make routine upgrades look like instance customization work.

## Decision

Product-managed public runtime assets with `v8s-` filenames stay in `defaults/public/`. Instance repositories should not
copy them into `custom/public/` as part of normal maintenance. The build already includes the default asset from
`defaults/public/` when no custom shadow exists.

`custom/public/` remains the right place for instance-owned HTML, CSS, JavaScript, fonts, images, manifests, and page
replacements. Instance-specific assets should use instance-owned filenames instead of `v8s-` product names.

When `npm run doctor` sees `custom/public/v8s-*`, it treats the file as a managed asset shadow. The recommended
`./scripts/v8s-fix --assets` action removes the shadow so the next build uses the product asset from `defaults/public/`.

If an operator deliberately forks a `v8s-` runtime asset, that file becomes a maintained local fork. The operator should
document the exception in `custom/v8s-custom-overrides.json` with a narrow ignore and accept that upgrades will not
automatically update the fork.

## Consequences

- Product CSS and JavaScript fixes reach existing instances during upgrade without copying files into `custom/public/`
- `custom/public/` stays focused on instance-owned pages and assets
- `v8s-fix --assets` removes stale managed shadows instead of syncing copies from defaults
- Deliberate product-asset forks remain possible, but they are explicit local maintenance decisions
- Custom pages can still reference same-host instance CSS, JavaScript, fonts, images, and manifests under non-product
  filenames
