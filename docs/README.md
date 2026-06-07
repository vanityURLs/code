# vanityURLs instance

This repository contains the source of truth for a vanityURLs short-link redirector instance.

Instance-owned configuration lives in `custom/` and `wrangler.toml`. Product defaults live in `defaults/` and are
refreshed by `npm run upgrade`. By default, upgrades pull the latest stable upstream release tag; use
`npm run upgrade -- --ref main` only when intentionally testing unreleased product code.

## Everyday workflow

Install dependencies once after cloning or upgrading:

```bash
npm install
```

Review the current links:

```bash
./scripts/v8s-lnk list
```

Add or edit links with `./scripts/v8s-lnk`, then verify link-only changes:

```bash
npm run check:links
```

Run `npm run check` for broader product, template, or policy changes.

Commit and push changes to GitHub. When the repository is connected to Cloudflare Workers & Pages, Cloudflare deploys
the pushed commit automatically.

## Important files

- `custom/v8s-links.txt` is the human-authored source of truth for short links
- `custom/v8s-site-config.json` stores instance settings such as domain, languages, operator contacts, branding, and
  link defaults
- `custom/v8s-policies.json` replaces the default destination policy when an instance needs its own policy
- `wrangler.toml` stores the Worker name, route, assets binding, and Cloudflare variables

Generated files in `build/`, `src/`, and `functions/` are build outputs. Do not edit them directly.

## Useful commands

```bash
npm run setup
npm run upgrade
npm run help
npm run check
npm run test
npm run validate
npm run smoke
npm run local-install
node scripts/check-upstream-release.mjs
./scripts/v8s-lnk --help
./scripts/v8s-lnk list
```

Grouped commands run the whole group by default. Use focused variants such as `npm run test:worker`,
`npm run check:links`, `npm run validate:targets`, or `npm run smoke:analytics` when you only need one layer.

## Optional upgrade nudge

vanityURLs does not phone home. To get a pull-based monthly reminder when this instance falls behind upstream releases,
copy the workflow template into this repository:

```bash
mkdir -p .github/workflows
cp defaults/github/workflows/vanityurls-upgrade-nudge.yml .github/workflows/
```

The workflow checks the public GitHub releases API monthly and opens or updates one issue in this repository when a
newer vanityURLs release is available. It does not send this instance's links or configuration upstream.

For an opt-in local check, run:

```bash
npm run doctor -- --check-upstream
```

Offline or unavailable network checks are non-fatal.

## Documentation

Use the vanityURLs documentation site for setup, customization, and operations:

- Quickstart: https://www.vanityurls.link/en/docs/setup/quickstart/
- v8s-lnk command line interface: https://www.vanityurls.link/en/docs/command-line-interface/lnk/
- Configuration files: https://www.vanityurls.link/en/docs/reference/configuration-files/
- Upgrading an instance: https://www.vanityurls.link/en/docs/reference/upgrading/
