![logo](.github/banner.png)

[![License](https://img.shields.io/github/license/vanityURLs/code?style=flat-square&labelColor=111827&color=0F766E)](LICENSE) [![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-0F766E?style=flat-square&labelColor=111827)](.github/CODE_OF_CONDUCT.md) [![All Contributors](https://img.shields.io/badge/all_contributors-4-0F766E?style=flat-square&labelColor=111827)](#contributors)

vanityURLs is a Cloudflare Workers redirector for running a branded short-link domain as code. Links, schedules, destination policies, localized instance pages, and operator configuration live in Git; the build produces the Worker assets that Cloudflare deploys.

## Documentation

The website is the source of truth for setup and operations:

* [Getting started](https://www.VanityURLs.link/en/docs/getting-started/)
* [Customize your instance](https://www.VanityURLs.link/en/docs/customize-overview/)
* [Local CLI](https://www.VanityURLs.link/en/docs/cli/)
* [Full documentation](https://www.VanityURLs.link/en/docs/)

## Local Workflow

Run `npm run setup` first to configure the instance, then `npm run local-install` to install workstation helpers. Run `npm run local-publish` after local edits when you want checks, commit selection, and push handled in one step. Run `./scripts/lnk --help` for the local link-management quick reference.

## Contributions

[Contributions](.github/CONTRIBUTING.md) are welcome! We recognize [all types](https://allcontributors.org/docs/en/emoji-key) based on the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Please note that this project is released with a [Contributor Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="16.66%"><a href="https://github.com/bhdicaire"><img src="https://avatars.githubusercontent.com/u/1316765?v=4?s=100" width="100px;" alt="Benoît H. Dicaire"/><br /><sub><b>Benoît H. Dicaire</b></sub></a><br /><a href="https://github.com/vanityURLs/code/commits?author=bhdicaire" title="Code">💻</a> <a href="https://github.com/vanityURLs/code/commits?author=bhdicaire" title="Documentation">📖</a> <a href="#security-bhdicaire" title="Security">🛡️</a></td>
      <td align="center" valign="top" width="16.66%"><a href="http://felixleger.com"><img src="https://avatars.githubusercontent.com/u/7781739?v=4?s=100" width="100px;" alt="Félix Léger"/><br /><sub><b>Félix Léger</b></sub></a><br /><a href="#ideas-felleg" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-felleg" title="User Testing">📓</a> <a href="#promotion-felleg" title="Promotion">📣</a></td>
      <td align="center" valign="top" width="16.66%"><a href="https://xvii.au"><img src="https://avatars.githubusercontent.com/u/446329?v=4?s=100" width="100px;" alt="Jake Edwards"/><br /><sub><b>Jake Edwards</b></sub></a><br /><a href="https://github.com/vanityURLs/code/commits?author=XVII" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="16.66%"><a href="https://github.com/slig"><img src="https://avatars.githubusercontent.com/u/37779?v=4?s=100" width="100px;" alt="Tiago Serafim"/><br /><sub><b>Tiago Serafim</b></sub></a><br /><a href="https://github.com/vanityURLs/code/commits?author=slig" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## Related
 * [dnsConfiguration](https://github.com/bhdicaire/dnsConfiguration) – Automated DNS configuration with StackOverflow's DNSControl and Git

## Licence
**vanityURLs** is Copyright 2023 Benoît H. Dicaire and [licensed under the MIT licence](https://github.com/vanityURLs/code/blob/main/LICENSE).
