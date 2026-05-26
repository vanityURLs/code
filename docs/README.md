# vanityURLs instance

This repository contains the source of truth for a vanityURLs short-link redirector instance.

Instance-owned configuration lives in `custom/` and `wrangler.toml`. Product defaults live in `defaults/` and are
refreshed by `npm run upgrade`.

## Everyday workflow

Install dependencies once after cloning or upgrading:

```bash
npm install
```

Review the current links:

```bash
./scripts/lnk list
```

Add or edit links with `./scripts/lnk`, then verify the instance:

```bash
npm run check
```

Commit and push changes to GitHub. When the repository is connected to Cloudflare Workers & Pages, Cloudflare deploys
the pushed commit automatically.

## Important files

- `custom/v8s-links.txt` is the human-authored source of truth for short links
- `custom/v8s-site-config.json` stores instance settings such as domain, languages, operator contacts, branding, and
  link defaults
- `custom/v8s-policies.json` stores instance destination policy overrides when needed
- `wrangler.toml` stores the Worker name, route, assets binding, and Cloudflare variables

Generated files in `build/`, `src/`, and `functions/` are build outputs. Do not edit them directly.

## Useful commands

```bash
npm run setup
npm run check
npm run local-install
./scripts/lnk --help
./scripts/lnk list
```

## Documentation

Use the vanityURLs documentation site for setup, customization, and operations:

- Quickstart: https://www.vanityurls.link/en/docs/setup/quickstart/
- LNK command line interface: https://www.vanityurls.link/en/docs/command-line-interface/lnk/
- Configuration files: https://www.vanityurls.link/en/docs/reference/configuration-files/
- Upgrading an instance: https://www.vanityurls.link/en/docs/reference/upgrading/
