# Repository rules

This document records the intended GitHub organization and repository security settings for `vanityURLs/code`.

Repository files can document this state and can provide workflow/configuration files such as Dependabot. GitHub
rulesets, secret scanning, push protection, administrator bypass, and organization account requirements still need to be
applied in GitHub by an owner or through the GitHub API with administrative credentials.

## Maintainer Accounts

- Require two-factor authentication for the organization.
- Require phishing-resistant authentication, such as passkeys or security keys, for maintainers with write or admin
  access.
- Keep organization owners to the smallest practical group.
- Give contributors the least privilege that works. Prefer forks and pull requests over direct write access.

## Main Branch Ruleset

Target: `refs/heads/main`

Desired rules:

- require pull requests before merge
- require at least one approval; use two approvals when the maintainer pool can support it
- dismiss stale approvals when new commits are pushed
- require review from CODEOWNERS
- require status check `check` / `ci:check` to pass before merge
- require signed commits
- block force-pushes
- block branch deletion
- include administrators and avoid bypass actors

## Release Tag Ruleset

Target: `refs/tags/v*`

Desired rules:

- block tag deletion
- block tag updates and force-pushes
- restrict tag creation to trusted release signers where GitHub supports it cleanly
- include administrators and avoid bypass actors

Release tags must be Sigstore/gitsign signed by an identity listed in `.github/release-signers.json`.

## Actions Security

- Set the repository default `GITHUB_TOKEN` permission to read-only.
- Grant workflow permissions per job with explicit `permissions:` blocks.
- Do not expose deploy or publish secrets to `pull_request` workflows.
- Put jobs that touch deploy or publish secrets behind protected environments with manual approval.
- Pin third-party actions to full commit SHAs before enforcing the final hardened ruleset.
- Keep Dependabot enabled for npm and GitHub Actions updates through `.github/dependabot.yml`.
- Keep dependency review enabled for pull requests through `.github/workflows/dependency-review.yml`.

## Repository Security Features

Enable these in GitHub security settings or through the GitHub API:

- Dependabot alerts
- Dependabot security updates
- secret scanning
- push protection for secret scanning
- private vulnerability reporting, if available for the repository

## Drift Review

Review this file whenever repository rules, workflows, release signing, or GitHub organization access changes.

Before enforcing new rulesets, export or document the final GitHub settings under `.github/rulesets/` so the intended
state can be reviewed in Git.
