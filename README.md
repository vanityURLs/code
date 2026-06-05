![logo](.github/banner.png)

[![License](https://img.shields.io/github/license/vanityURLs/code?style=flat-square&labelColor=111827&color=0F766E)](LICENSE)
[![Release](https://img.shields.io/github/v/release/vanityURLs/code?style=flat-square&labelColor=111827&color=0F766E)](https://github.com/vanityURLs/code/releases/latest)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-0F766E?style=flat-square&labelColor=111827)](.github/CODE_OF_CONDUCT.md)
[![All Contributors](https://img.shields.io/badge/all_contributors-4-0F766E?style=flat-square&labelColor=111827)](#contributors)

vanityURLs is a Cloudflare Workers redirector for running a branded short-link domain as code. Links, schedules,
destination policies, localized instance pages, and operator configuration live in Git; the build produces the Worker
assets that Cloudflare deploys.

The [documentation](https://vanityurls.link/en/docs/setup/) on the website is the source of truth for setup and
operations.

## Lookup Turnstile

Redirect paths such as `/{slug}` stay free of Turnstile so published short links, QR codes, and automation-safe
redirects keep working without an interactive challenge. The protected surface is the public lookup flow: the browser
opens `/lookup`, receives a Turnstile token for the `lookup` action, and submits that token with `POST /lookup/resolve`.

Lookup fails closed when Turnstile is not configured. Set `V8S_TURNSTILE_SITE_KEY` as a Worker variable and
`V8S_TURNSTILE_SECRET_KEY` as a Worker secret before enabling lookup for visitors. The shorter dashboard names
`TURNSTILE_SITE` and `TURNSTILE_SECRET` are also accepted. The Worker validates the token with Cloudflare `siteverify`
and rejects successful responses whose returned hostname does not match the request host or whose action is not
`lookup`. If the secret is missing, lookup resolution returns `503`; missing or invalid visitor tokens return `403`.
Keep Cloudflare WAF and rate limiting in front of lookup because valid-token abuse can still repeat expensive exact-slug
checks.

## Quickstart

Before starting, you need a registered short domain, GitHub and Cloudflare accounts, Git, Node.js 20 or newer, npm, and
a text editor. The short domain must use Cloudflare as its authoritative DNS provider before the Worker can serve it.

Follow the [documentation](https://vanityurls.link/en/docs/quickstart) to spin your vanityURLs' instance.

## Contributions

[Contributions](.github/CONTRIBUTING.md) are welcome! We recognize
[all types](https://allcontributors.org/docs/en/emoji-key) based on the
[all-contributors](https://github.com/all-contributors/all-contributors) specification. Please note that this project is
released with a [Contributor Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating in this project you agree to
abide by its terms.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="16.66%"><a href="https://github.com/bhdicaire"><img src="https://avatars.githubusercontent.com/u/1316765?v=4?s=100" width="100px;" alt="Benoît H. Dicaire"/><br /><sub><b>Benoît H. Dicaire</b></sub></a><br /><a href="https://github.com/vanityurls/code/commits?author=bhdicaire" title="Code">💻</a> <a href="https://github.com/vanityurls/code/commits?author=bhdicaire" title="Documentation">📖</a> <a href="#security-bhdicaire" title="Security">🛡️</a></td>
      <td align="center" valign="top" width="16.66%"><a href="https://github.com/0xBJA"><img src="https://avatars.githubusercontent.com/u/224307522?v=4?s=100" width="100px;" alt="Brian J. Adams"/><br /><sub><b>Brian J. Adams</b></sub></a><br /><a href="#ideas-0xBJA" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-0xBJA" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="16.66%"><a href="http://felixleger.com"><img src="https://avatars.githubusercontent.com/u/7781739?v=4?s=100" width="100px;" alt="Félix Léger"/><br /><sub><b>Félix Léger</b></sub></a><br /><a href="#ideas-felleg" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-felleg" title="User Testing">📓</a> <a href="#promotion-felleg" title="Promotion">📣</a></td>
      <td align="center" valign="top" width="16.66%"><a href="https://xvii.au"><img src="https://avatars.githubusercontent.com/u/446329?v=4?s=100" width="100px;" alt="Jake Edwards"/><br /><sub><b>Jake Edwards</b></sub></a><br /><a href="https://github.com/vanityurls/code/commits?author=XVII" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="16.66%"><a href="https://github.com/slig"><img src="https://avatars.githubusercontent.com/u/37779?v=4?s=100" width="100px;" alt="Tiago Serafim"/><br /><sub><b>Tiago Serafim</b></sub></a><br /><a href="https://github.com/vanityurls/code/commits?author=slig" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## Related

- [dnsConfiguration](https://github.com/bhdicaire/dnsConfiguration) – Automated DNS configuration with StackOverflow's
  DNSControl and Git

## Licence

**vanityURLs** is Copyright 2023 Benoît H. Dicaire and
[licensed under the MIT licence](https://github.com/vanityurls/code/blob/main/LICENSE).
