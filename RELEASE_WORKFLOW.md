# Release workflow

This is the canonical release workflow for the vanityURLs code repository. Blog posts can explain the rationale, but
this file is the operational source of truth maintainers must follow.

## Trust Model

Release-please prepares the release pull request. It is not the final release signer.

Published `vX.Y.Z` release tags are created manually by a trusted maintainer with Sigstore/gitsign. The trusted signer
identities are pinned in `.github/release-signers.json` and documented in `.github/MAINTAINERS.md`.

This proves release provenance before `npm run upgrade` consumes upstream product code. It does not prove the code is
safe; maintainers still review changes, run checks, and protect GitHub accounts.

## Signing Standard

Use SSH signing backed by 1Password for day-to-day commits. Use Sigstore/gitsign for release tags and other
provenance-sensitive actions.

This keeps normal development fast while making published release boundaries auditable through an OIDC identity and the
Sigstore transparency log.

<details>
<summary>Daily commit signing</summary>

Day-to-day commits should use SSH signing through 1Password:

```sh
git config --global gpg.format ssh
git config --global gpg.ssh.program "/Applications/1Password.app/Contents/MacOS/op-ssh-sign"
git config --global commit.gpgsign true
```

Use the SSH signing key registered with GitHub for the maintainer's `code@Dicaire.com` or maintainer-approved identity.

</details>

<details>
<summary>Release tag signing</summary>

Release tags must use Sigstore/gitsign:

```sh
git -c gpg.format=x509 -c gpg.x509.program=gitsign tag -s vX.Y.Z -m "vX.Y.Z"
git -c gpg.format=x509 -c gpg.x509.program=gitsign verify-tag -v vX.Y.Z
```

Prefer per-command `-c gpg.format=x509 -c gpg.x509.program=gitsign` for release tag creation. This avoids changing the
global commit-signing configuration used for SSH/1Password daily commits.

</details>

## Daily Development

Do not work directly on `main`.

1. Pull the latest `main`: `git switch main` then `git pull --rebase`.
2. Create a branch: `git switch -c work/descriptive-name`.
3. Make the change.
4. Run the relevant check: `npm run check` for broad changes, or a focused script when the change is narrow.
5. Stage the intended changes: `git add .`.
6. Commit with a Conventional Commits message and SSH/1Password signing enabled: `git commit -m "type: summary"`.
7. Push the branch: `git push origin HEAD`.
8. Open a pull request: `gh pr create --fill`.
9. Require review and `ci:check` before merge.
10. Merge using the repository's documented merge strategy.

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

<details>
<summary>Pull request CLI commands</summary>

Open a pull request from the current branch:

```sh
gh pr create --fill
```

Watch pull request checks:

```sh
gh pr checks --watch
```

Approve a pull request authored by someone else or a bot:

```sh
gh pr review PR_NUMBER --approve
```

Merge after checks and required review pass:

```sh
gh pr merge PR_NUMBER --merge --delete-branch
```

For maintainer-authored pull requests during stabilization, bypass only when checks have passed and the change does not
require second human review:

```sh
gh pr merge PR_NUMBER --merge --admin --delete-branch
```

</details>

<details>
<summary>Choosing the relevant check</summary>

- For broad product, Worker, policy, or generated-output changes: `npm run check`.
- For maintenance script changes, such as `scripts/doctor.mjs`, `scripts/setup.mjs`, `scripts/upgrade.mjs`, or shared
  script libraries: run the focused test that covers the changed path, then `npm run check` before merge.
- For doctor output changes: `npm run doctor -- --json`.
- For opt-in upstream nudge changes: `npm run doctor -- --json --check-upstream`.
- For manual upstream release checks:
  `node scripts/check-upstream-release.mjs --json --current-version 0.0.0 --repo vanityURLs/code`.

Network-backed upstream checks must stay non-fatal.

</details>

## Dependabot Maintenance

Dependabot pull requests are authored by `dependabot[bot]`, so maintainers may approve them. Review that the diff only
updates the expected dependency or GitHub Action, wait for checks, then merge.

When several Dependabot pull requests touch workflow files, merge them as a maintenance batch. If a Dependabot branch
conflicts after `main` moves, ask Dependabot to rebase instead of resolving the bot branch manually:

```sh
gh pr comment PR_NUMBER --body "@dependabot rebase"
```

If Dependabot reports missing labels, create the labels instead of editing every pull request:

```sh
gh label create dependencies --repo vanityURLs/code --color 0366d6 --description "Dependency updates"
gh label create github-actions --repo vanityURLs/code --color 5319e7 --description "GitHub Actions dependency updates"
```

Because `chore` is mapped to patch releases, merged Dependabot chores will usually produce a release-please patch pull
request.

## Release-Please

Release-please runs after commits land on `main`.

The workflow is configured with `skip-github-release: true`, so release-please only prepares or updates the release pull
request. It must not create the release tag.

When release-please opens or updates the release pull request:

1. Confirm the version bump is correct.
2. Review `CHANGELOG.md` for operator-facing clarity.
3. Confirm `.release-please-manifest.json`, `package.json`, and `package-lock.json` are consistent.
4. Confirm no user-visible change was hidden behind an inappropriate commit type.
5. Approve and merge the release pull request only when the release should be published.

The release pull request is authored by `github-actions[bot]`, so a maintainer may approve it even when that maintainer
authored the underlying feature or fix commits. GitHub does not allow an author to satisfy review requirements on their
own pull request, but the release-please pull request has the bot as author.

CLI flow:

```sh
gh pr view RELEASE_PR_NUMBER --repo vanityURLs/code --web
gh pr checks RELEASE_PR_NUMBER --repo vanityURLs/code --watch
gh pr review RELEASE_PR_NUMBER --repo vanityURLs/code --approve
gh pr merge RELEASE_PR_NUMBER --repo vanityURLs/code --merge --delete-branch
```

<details>
<summary>Release preparation checklist</summary>

- Confirm the worktree only contains intended release changes: `git status --short`.
- Confirm the release signer is listed in `.github/release-signers.json`.
- Confirm the release tag will be created with Sigstore/gitsign, not the daily SSH/1Password commit signer.
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

Release tags use gitsign even when daily commits use SSH/1Password signing. Create the tag with per-command gitsign
configuration so global commit signing remains unchanged:

```sh
git -c gpg.format=x509 -c gpg.x509.program=gitsign tag -s vX.Y.Z -m "vX.Y.Z"
```

After the release pull request has merged:

```sh
git switch main
git pull --rebase
npm run check
git -c gpg.format=x509 -c gpg.x509.program=gitsign tag -s vX.Y.Z -m "vX.Y.Z"
git -c gpg.format=x509 -c gpg.x509.program=gitsign verify-tag -v vX.Y.Z
git push origin vX.Y.Z
awk '/^## /{if(seen) exit; seen=1} seen {print}' CHANGELOG.md > /tmp/vanityurls-vX.Y.Z-release-notes.md
gh release create vX.Y.Z --repo vanityURLs/code --title "vX.Y.Z" --notes-file /tmp/vanityurls-vX.Y.Z-release-notes.md --latest
gh pr edit RELEASE_PR_NUMBER --repo vanityURLs/code --remove-label "autorelease: pending" --add-label "autorelease: tagged"
gh release list --repo vanityURLs/code --limit 5
```

`gitsign verify` verifies commits, not annotated release tags. For release tags, use `git verify-tag -v` with the same
per-command gitsign configuration used to create the tag.

Confirm the verification output shows the expected signer identity and issuer, such as:

- `Good signature from [code@Dicaire.com](https://github.com/login/oauth)`
- `Validated Git signature: true`
- `Validated Rekor entry: true`

Use the signer identity that matches the maintainer creating the tag. For Felix, the expected identity is
`felix@felixleger.com` with issuer `https://github.com/login/oauth`.

If a release tag was accidentally created with SSH signing and already pushed, do not move or recreate the tag without a
deliberate maintainer decision. Publish that release as transitional, then use gitsign for the next release tag.

Do not push an unsigned release tag. Do not move or recreate a release tag. Publish the GitHub Release after the tag is
pushed so operators using `Watch -> Releases` are notified. Mark the release-please pull request as
`autorelease: tagged` after publishing because this repository uses `skip-github-release: true`.

<details>
<summary>Release tag checklist</summary>

- Merge the release-please release pull request.
- Pull the clean release commit locally: `git switch main` then `git pull --rebase`.
- Run the release confidence check: `npm run check`.
- Create the signed release tag with gitsign:
  `git -c gpg.format=x509 -c gpg.x509.program=gitsign tag -s vX.Y.Z -m "vX.Y.Z"`.
- Verify the tag: `git -c gpg.format=x509 -c gpg.x509.program=gitsign verify-tag -v vX.Y.Z`.
- Confirm the verification output shows the expected signer identity and `https://github.com/login/oauth` issuer.
- Push the tag only after verification: `git push origin vX.Y.Z`.
- Prepare release notes from the latest changelog section:
  `awk '/^## /{if(seen) exit; seen=1} seen {print}' CHANGELOG.md > /tmp/vanityurls-vX.Y.Z-release-notes.md`.
- Publish the GitHub Release from the pushed tag:
  `gh release create vX.Y.Z --repo vanityURLs/code --title "vX.Y.Z" --notes-file /tmp/vanityurls-vX.Y.Z-release-notes.md --latest`.
- Mark the release-please pull request as tagged:
  `gh pr edit RELEASE_PR_NUMBER --repo vanityURLs/code --remove-label "autorelease: pending" --add-label "autorelease: tagged"`.
- Confirm GitHub shows the latest release: `gh release list --repo vanityURLs/code --limit 5`.
- Confirm GitHub release tag rules protect `refs/tags/v*` from deletion, updates, and force-pushes, including
  administrator bypass.

</details>

<details>
<summary>Repairing a missing release tag</summary>

If release-please reports `There are untagged, merged release PRs outstanding`, the manifest may point to a version
whose tag was never pushed. Create the missing signed tag on the release PR merge commit, not on the current `HEAD`:

```sh
git switch main
git pull --rebase
git -c gpg.format=x509 -c gpg.x509.program=gitsign tag -s vX.Y.Z RELEASE_MERGE_COMMIT -m "vX.Y.Z"
git -c gpg.format=x509 -c gpg.x509.program=gitsign verify-tag -v vX.Y.Z
git push origin vX.Y.Z
awk '/^## /{if(seen) exit; seen=1} seen {print}' CHANGELOG.md > /tmp/vanityurls-vX.Y.Z-release-notes.md
gh release create vX.Y.Z --repo vanityURLs/code --title "vX.Y.Z" --notes-file /tmp/vanityurls-vX.Y.Z-release-notes.md
gh pr edit RELEASE_PR_NUMBER --repo vanityURLs/code --remove-label "autorelease: pending" --add-label "autorelease: tagged"
```

Rerun release-please after the repair. It should find the tag and stop scanning back into older repository history.

```sh
gh run list --repo vanityURLs/code --workflow release-please.yml --limit 5
gh run rerun RUN_ID --repo vanityURLs/code
```

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
