# Release workflow

This is the canonical release workflow for the vanityURLs code repository. Blog posts can explain the rationale, but
this file is the operational source of truth maintainers must follow.

## Trust Model

Release-please prepares the release pull request. It is not the final release signer.

Published `vX.Y.Z` release tags are created manually by a trusted maintainer with Sigstore/gitsign. The trusted signer
identities are pinned in `.github/release-signers.json` and documented in `.github/MAINTAINERS.md`.

This proves release provenance before `npm run upgrade` consumes upstream product code. It does not prove the code is
safe; maintainers still review changes, run checks, and protect GitHub accounts.

## Daily Development

Do not work directly on `main`.

1. Pull the latest `main`: `git switch main` then `git pull --rebase`.
2. Create a branch: `git switch -c work/descriptive-name`.
3. Make the change.
4. Run the relevant check: `npm run check` for broad changes, or a focused script when the change is narrow.
5. Commit with a Conventional Commits message: `git commit -m "type: summary"`.
6. Push the branch: `git push origin HEAD`.
7. Open a pull request.
8. Require review and `ci:check` before merge.
9. Merge using the repository's documented merge strategy.

Use squash merge when the pull request is the release unit. In that case, the pull request title must be a valid
Conventional Commit because it becomes the commit that release-please reads on `main`.

<details>
<summary>Branch update commands</summary>

Use rebase for a branch only you are working on:

```sh
git fetch origin main
git rebase origin/main
git push --force-with-lease
```

Use merge if other people are also basing work on your branch:

```sh
git fetch origin main
git merge origin/main
git push
```

Preview overlap before updating:

```sh
git fetch origin main
git diff --name-status HEAD...origin/main
```

</details>

## Release-Please

Release-please runs after commits land on `main`.

The workflow is configured with `skip-github-release: true`, so release-please only prepares or updates the release pull
request. It must not create the release tag.

When release-please opens or updates the release pull request:

1. Confirm the version bump is correct.
2. Review `CHANGELOG.md` for operator-facing clarity.
3. Confirm `.release-please-manifest.json`, `package.json`, and `package-lock.json` are consistent.
4. Confirm no user-visible change was hidden behind an inappropriate commit type.
5. Merge the release pull request only when the release should be published.

<details>
<summary>Release preparation checklist</summary>

- Confirm the worktree only contains intended release changes: `git status --short`.
- Confirm the release signer is listed in `.github/release-signers.json`.
- Confirm Git tag signing uses Sigstore/gitsign:
  - `git config --get gpg.format` returns `x509`.
  - `git config --get gpg.x509.program` returns `gitsign`.
  - `git config --get tag.gpgsign` returns `true`.
- Review runtime registry schema changes with `docs/adr/`.
- Run `npm run clean`.
- Run `npm run check`.
- Run `npm run validate:targets` when release confidence should include outbound target reachability.
- Confirm `build/v8s-release-manifest.json` was generated.
- Review `build/v8s-release-manifest.json` schema versions, Git commit, compatibility date, and SHA-256 hashes.
- Review generated `build/v8s.json`, `build/v8s-blocklist.json`, and `build/v8s-site-config.json`.
- Confirm `build/v8s.json` uses the expected runtime registry schema.
- Confirm `build/v8s.json` includes both `tree` and `links[]`.
- Confirm `src/worker.mjs` is generated from `scripts/workers/`.

</details>

## Security Releases

Security fixes must be published as normal GitHub releases, with the release title or notes clearly including
`Security`, a `CVE-*`, or a `GHSA-*` identifier when one applies. The optional operator upgrade nudge uses those markers
to make behind-version notices louder when the release gap includes a security fix.

When a vulnerability affects released vanityURLs code, also publish a GitHub Security Advisory so operators using
GitHub's `Watch -> Releases` and security notification workflows receive the strongest available platform signal.

<details>
<summary>Security release checklist</summary>

- Confirm the fix is merged through the normal reviewed release flow.
- Confirm the release notes identify the security impact without exposing unnecessary exploit detail before operators
  can patch.
- Include `Security`, `CVE-*`, or `GHSA-*` in the GitHub release title or body.
- Publish or update the matching GitHub Security Advisory when appropriate.
- Push only the signed release tag after local verification.

</details>

## Signed Release Tag

Configure gitsign before creating release tags:

```sh
git config --global gpg.format x509
git config --global gpg.x509.program gitsign
git config --global tag.gpgsign true
```

After the release pull request has merged:

```sh
git switch main
git pull --rebase
npm run check
git tag -s vX.Y.Z -m "vX.Y.Z"
gitsign verify --certificate-identity code@Dicaire.com --certificate-oidc-issuer https://github.com/login/oauth vX.Y.Z
git push origin vX.Y.Z
```

Use the signer identity that matches the maintainer creating the tag. For Felix:

```sh
gitsign verify --certificate-identity felix@felixleger.com --certificate-oidc-issuer https://github.com/login/oauth vX.Y.Z
```

Do not push an unsigned release tag. Do not move or recreate a release tag.

<details>
<summary>Release tag checklist</summary>

- Merge the release-please release pull request.
- Pull the clean release commit locally: `git switch main` then `git pull --rebase`.
- Run the release confidence check: `npm run check`.
- Create the signed release tag: `git tag -s vX.Y.Z -m "vX.Y.Z"`.
- Verify the tag with the signing identity:
  `gitsign verify --certificate-identity code@Dicaire.com --certificate-oidc-issuer https://github.com/login/oauth vX.Y.Z`.
- Push the tag only after verification: `git push origin vX.Y.Z`.
- Confirm GitHub release tag rules protect `refs/tags/v*` from deletion, updates, and force-pushes, including
  administrator bypass.

</details>

## Tag Protection

Before enforcing this workflow, configure GitHub tag rules for `refs/tags/v*`:

- block tag deletion
- block tag updates and force-pushes
- require release tags to be created by trusted maintainers
- avoid bypass actors
- include administrators in the rules where GitHub exposes that control

After tag protection is active, a pushed release tag is treated as immutable release provenance.

The intended GitHub repository rules are documented in `.github/repository-rules.md`.

<details>
<summary>Runtime smoke checks</summary>

- Start local Worker runtime with `npm run dev`.
- Confirm a known active short link redirects to the expected target.
- Confirm an unknown slug returns 404.
- Confirm disabled, expired, and maintenance states render the expected pages.
- Confirm a splat route preserves and encodes the remaining path.
- Confirm `/lookup` loads and can resolve a known link.
- Confirm direct access to `/v8s.json`, `/v8s-blocklist.json`, and `/v8s-site-config.json` returns 404.
- Confirm `/_stats` and `/_tests` require Cloudflare Access when access variables are configured.
- Confirm runtime smoke behavior with `npm run smoke` when analytics are configured.

</details>

## Upgrade Trust

`npm run upgrade` should prefer signed release tags over mutable branch refs. Until upgrade tooling enforces this
automatically, maintainers should treat mutable branch refs such as `main` as development-only upgrade sources.

For high-assurance upgrade testing, sync from a pinned release tag, review the diff, then run checks.

## Required Local Checks

Before merging a release pull request or pushing a signed release tag:

```sh
npm run check
```

Use `npm run validate:targets` when release confidence should include outbound target reachability.

<details>
<summary>Deployment and rollback checklist</summary>

Deployment:

- Deploy from a clean, reviewed worktree.
- Keep deployment credentials in GitHub or Cloudflare secrets, not in the repository.
- Watch Cloudflare deployment logs until the Worker is active.
- Confirm the custom domain points at the intended Worker.
- Confirm `workers.dev` and preview URLs are disabled unless intentionally exposed.
- Check Workers Logs for the first production requests.

Rollback:

- Identify the last known-good Git commit or Cloudflare deployment.
- Roll back the Cloudflare deployment or revert the Git commit.
- Re-run the runtime smoke checks.
- Confirm the Worker can read the previous `links[]` registry shape.
- Record the rollback reason in the release notes or incident log.

</details>

## Related Documents

- `docs/adr/0001-use-release-please-and-semantic-versioning.md`
- `docs/adr/0015-require-signed-release-tags.md`
- `.github/release-signers.json`
- `.github/MAINTAINERS.md`
- `.github/repository-rules.md`
