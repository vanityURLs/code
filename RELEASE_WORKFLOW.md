# Release workflow

This is the canonical release workflow for the vanityURLs code repository. Blog posts can explain the rationale, but
this file is the operational source of truth maintainers must follow before release tag rules are enforced.

## Trust Model

Release-please prepares the release pull request. It is not the final release signer.

Published `vX.Y.Z` release tags are created manually by a trusted maintainer with Sigstore/gitsign. The trusted signer
identities are pinned in `.github/release-signers.json` and documented in `.github/MAINTAINERS.md`.

This proves release provenance before `npm run upgrade` consumes upstream product code. It does not prove the code is
safe; maintainers still review changes, run checks, and protect GitHub accounts.

## Daily Development

Do not work directly on `main`.

1. Pull the latest `main`.
2. Create a branch.
3. Make the change.
4. Commit with a Conventional Commits message.
5. Push the branch.
6. Open a pull request.
7. Require review and `ci:check` before merge.
8. Merge using the repository's documented merge strategy.

Use squash merge when the pull request is the release unit. In that case, the pull request title must be a valid
Conventional Commit because it becomes the commit that release-please reads on `main`.

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

## Tag Protection

Before enforcing this workflow, configure GitHub tag rules for `refs/tags/v*`:

- block tag deletion
- block tag updates and force-pushes
- require release tags to be created by trusted maintainers
- avoid bypass actors
- include administrators in the rules where GitHub exposes that control

After tag protection is active, a pushed release tag is treated as immutable release provenance.

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

## Related Documents

- `RELEASE_CHECKLIST.md`
- `docs/adr/0001-use-release-please-and-semantic-versioning.md`
- `docs/adr/0015-require-signed-release-tags.md`
- `.github/release-signers.json`
- `.github/MAINTAINERS.md`
