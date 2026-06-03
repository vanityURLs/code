# Release checklist

Use this checklist for product releases and instance upgrades. The website blog explains the rationale; this file keeps
the code-repository activities close to the scripts and generated artifacts they verify.

## Before release

- Confirm the worktree only contains intended release changes: `git status --short`
- Review runtime registry schema changes with `docs/adr/`
- Run `npm run clean`
- Run `npm run check`
- Run `npm run validate:targets` when release confidence should include outbound target reachability
- Confirm `build/v8s-release-manifest.json` was generated
- Review `build/v8s-release-manifest.json` schema versions, Git commit, compatibility date, and SHA-256 hashes
- Review generated `build/v8s.json`, `build/v8s-blocklist.json`, and `build/v8s-site-config.json`
- Confirm `build/v8s.json` uses the expected runtime registry schema
- Confirm `build/v8s.json` includes both `tree` and `links[]`
- Confirm `src/worker.mjs` is generated from `scripts/workers/`

## Runtime smoke checks

- Start local Worker runtime with `npm run dev`
- Confirm a known active short link redirects to the expected target
- Confirm an unknown slug returns 404
- Confirm disabled, expired, and maintenance states render the expected pages
- Confirm a splat route preserves and encodes the remaining path
- Confirm `/lookup` loads and can resolve a known link
- Confirm direct access to `/v8s.json`, `/v8s-blocklist.json`, and `/v8s-site-config.json` returns 404
- Confirm `/_stats` and `/_tests` require Cloudflare Access when access variables are configured
- Confirm runtime smoke behavior with `npm run smoke` when analytics are configured

## Deployment

- Deploy from a clean, reviewed worktree
- Keep deployment credentials in GitHub or Cloudflare secrets, not in the repository
- Watch Cloudflare deployment logs until the Worker is active
- Confirm the custom domain points at the intended Worker
- Confirm `workers.dev` and preview URLs are disabled unless intentionally exposed
- Check Workers Logs for the first production requests

## Rollback

- Identify the last known-good Git commit or Cloudflare deployment
- Roll back the Cloudflare deployment or revert the Git commit
- Re-run the runtime smoke checks
- Confirm the Worker can read the previous `links[]` registry shape
- Record the rollback reason in the release notes or incident log
