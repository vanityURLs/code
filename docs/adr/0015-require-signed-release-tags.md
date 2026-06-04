# 0015. Require signed release tags for trusted upgrades

Date: 2026-06-04

Status: Accepted

## Context

Instance operators refresh product-owned files with `npm run upgrade`. The upgrade process fetches an upstream Git ref,
syncs product files such as `defaults/`, `scripts/`, and `package.json`, then can run build, test, and doctor commands
from the synced product code.

That means an upgrade ref is a supply-chain trust boundary. If the default ref is a mutable branch such as `main`, or if
an unsigned release tag can be moved or recreated, a compromised upstream account or workflow could cause an instance
operator to execute unreviewed upstream code during upgrade verification.

Release signatures do not prove that the code is safe. They prove that a trusted release identity authorized the Git
object being consumed. That is still valuable: it raises the cost of compromise, gives operators a stable provenance
check before execution, and makes unauthorized or disputed release publication easier to detect.

## Decision

Use release-please to prepare release pull requests, version bumps, changelog entries, and release notes. Do not treat
release-please as the final release signer.

After the release pull request is merged, a trusted maintainer creates and pushes the release tag with Sigstore/gitsign.
Release tags use the `vX.Y.Z` format.

Trusted release signatures are Sigstore/gitsign signatures whose certificate identity is one of the pinned release
signer identities in `.github/release-signers.json`, and whose certificate OIDC issuer is
`https://github.com/login/oauth`.

The initial trusted release signers are:

- `code@Dicaire.com`
- `felix@felixleger.com`

Protect release tags with GitHub tag rules for `refs/tags/v*`:

- block tag deletion
- block tag updates and force-pushes
- require the release tag to be created by a trusted maintainer
- include administrators in the rules and avoid bypass actors

Future upgrade hardening should make `npm run upgrade` default to the latest verified release tag instead of `main`,
support explicit `--ref vX.Y.Z` pinning, warn on mutable branch refs, verify the selected release tag before extracting
or executing product files, and document `--no-check` as the high-assurance "sync, review, then run checks" path.

The operational workflow maintainers must follow is documented in [RELEASE_WORKFLOW.md](../../RELEASE_WORKFLOW.md).

## Release Tag Procedure

Configure gitsign for tag signing:

```sh
git config --global gpg.format x509
git config --global gpg.x509.program gitsign
git config --global tag.gpgsign true
```

After the release pull request has merged and `main` is clean:

```sh
git pull
git tag -s vX.Y.Z -m "vX.Y.Z"
gitsign verify --certificate-identity code@Dicaire.com --certificate-oidc-issuer https://github.com/login/oauth vX.Y.Z
git push origin vX.Y.Z
```

Use the signer identity that matches the maintainer creating the release. A second trusted signer may independently
verify the pushed tag.

## Consequences

- Operators have a concrete provenance check before upgrade verification executes upstream product code.
- Release publication depends on trusted maintainer identity rather than only GitHub workflow authority.
- A compromised mutable branch is no longer an acceptable default upgrade source.
- A compromised maintainer account can still sign a malicious release if its identity controls are defeated; this model
  is provenance and detection, not an anti-tamper guarantee.
- GitHub tag protection becomes part of release operations. Some controls must be applied through GitHub repository or
  organization settings, or through the GitHub API with administrative credentials.
- Future SLSA provenance can add build-process guarantees beyond tag identity.
