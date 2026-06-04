# Governance

This document explains how decisions are made and how contributions are managed in this project. The goal is to keep
things simple, transparent, and welcoming.

## Roles

- **Users**: Anyone using the project, reporting bugs, or suggesting features
- **Contributors**: Anyone submitting pull requests, issues, or improvements
- **Maintainer**: The person (or small group) with write access to the repository, responsible for reviewing
  contributions and making final decisions

Currently, this project is maintained by:

- [Benoît H. Dicaire](https://github.com/bhdicaire)
- [Felix Leger](https://github.com/felleg)

Trusted release signers are listed in [MAINTAINERS.md](MAINTAINERS.md). Release signers create Sigstore/gitsign tags for
published `vX.Y.Z` releases.

## Decision-Making

- Day-to-day changes (bug fixes, minor improvements) are decided by the maintainer and merged after review
- Larger changes (new features, breaking changes) should be proposed and discussed in a GitHub issue before
  implementation
- Final decisions rest with the maintainer

## Becoming a Maintainer

This project is currently maintained by a single individual. If the project grows and consistent contributors emerge,
they may be invited to join as co-maintainers.

Becoming a release signer is a separate trust decision. Release signers must use phishing-resistant account protection
and must be added to `.github/release-signers.json` before their release tags are trusted by upgrade tooling.

## Conflict Resolution

We encourage respectful, constructive discussions. Most discussions and decisions happen publicly on GitHub through
Issues, and Pull Requests. If disagreements arise and consensus cannot be reached, the maintainer will make the final
decision.

## Amendments

This governance model may be updated over time. Changes will be proposed in a pull request and discussed openly before
adoption.
