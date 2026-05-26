# Cloudflare Setup

## Account Main Menu --> Workers & Pages

1. Create application

- Continue Github
- Select a repository
- Confirm the Project name as written in the wrangler.toml, in this case website
- Leave `Build` and `Deploy`as is, the wrangler.toml will take over
- Deselect builds for non-production branches

2. Set up an [Identity Provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/)

   > Cloudflare maintains access using HTTP Cookies (e.g., session Persistence for 24 Hours). As long as the session is
   > valid, Cloudflare will automatically refresh the _Application Session_ in the background without prompting the user
   > to log in again.

1. Go to Account Main Menu --> Zero Trust --> Integration --> Identity providers
1. You can select [GitHub](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/) or
   [Generic Google authentication](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/).
   As an alternative to configuring an identity provider, Cloudflare One can send a
   ~[one-time PIN \(OTP\)](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)~
   to approved email addresses. No configuration needed — simply add a user's email address to an
   ~[Access policy](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)~ and to the group that
   allows your team to reach the application.
   - You can simultaneously configure an OTP and several identity providers (IdP) as authentication method. If a user
     has the same email registered in multiple IdP, there is no technical conflict, but the user experience changes:
   - The user must select an IdP on the login page first. Cloudflare then validates the identity returned by that
     specific provider
   - Your policy that allow _user@example.com_ will be satisfied as long as the chosen IdP returns that specific email
     address

### Okta

1. Create an [Okta Integrator Free Plan](https://developer.okta.com/signup/). 2.Go to Admin Console --> Applications -->
   Applications
2. Select Browse App Catalog.
3. Search for Cloudflare and select Cloudflare One
4. Select Add integration. |---|---| | Application label | Cloudflare Access | | Team domain | vanityURLs (only the
   subdomain prefix, do not include .cloudflareaccess.com) | | Client secret | [REDACTED] |
5. In the Sign On tab, copy the Client ID and Client secret in your password manager
6. Copy your Okta Account URL (without the -admin value) such as https://integrator-1234567.okta.com

Okta is designed as an extensible identity platform that supports various Multi-Factor Authentication (MFA) methods
including TOTP and Passkeys in addition to Okta Verify. Admin Console --> Security --> AUthenticators

Reference: Cloudflare documentation
[Set up Okta as an OIDC provider (Okta App Catalog)](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/okta/)

#### Cloudflare configuration

Cloudflare Account Home --> Zero Trust --> Integrations --> Identity provider

|---|---| | Name| Okta IdP | | App ID (clientId) | [REDACTED] | | Client secret | [REDACTED] | | Okta account URL |
https://integrator-8659872.okta.com | | Proof Key for Code Exchange (PKCE) | On|

### Github

Follow the
[Cloudflare instructions](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/) it's
straighforward.

The GitHub integration is not restricted to organizations. You can use it with any GitHub account, including individual
ones . In your Access Policy, you control who gets in by filtering for specific GitHub usernames, email addresses, or
organization memberships.

You can use several GitHub-specific and global selectors to control access:

- Restricts access to members of a specific GitHub organization with `GitHub Organization`
- GitHub Org members who also have a corporate email
  - check their email with `https://api.github.com/users/bhdicaire`, in my case `"email": null,` as I don't disclose it.
- Requires the user to have the Cloudflare WARP client connected
- Restricts access to specific network locations or office IPs with `IP Ranges`
- Restricts access based on the user's geographic location with `Country`

### Google Generic

Follow the
[Cloudflare instructions](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) it's
straighforward.

3. Create an Application (Account Main Menu --> Zero Trust --> Access Controls --> Applications)
1. Create application
1. Select the `Self-hosted and private` tab
1. Click on `Continue  with Self-hosted and private`
   - Your application name is based on the subdomain + domain selected in the `Destinations`below

1. Select the `Application details`
1. Protect the paths below in the `Destinations`section:

| Subdomain | Domain            | Path       |
| --------- | ----------------- | ---------- |
|           | \* vanityURL.link | \_stats    |
|           | \* vanityURL.link | \_stats/\* |
|           | \* vanityURL.link | \_tests    |
|           | \* vanityURL.link | \_tests/\* |

6.  Don't forget to choose available identity providers for this application.
7.  Access policies
    - Create new policy
      - Policy name: "Allow emails"
      - Action: Allow
      - Session duration: 24 hours
      - Include:
        - Selector: Emails
        - Value: yourEmailAddress.domain.com, ...
      - Policy tester: click on test policy

8.  Select the `Additional settings` tab
    - Go to `Application Audience (AUD) Tag`section
    - Copy the below value
9.  - Save policy
10. Add Variables and Secrets
11. Select `Website Workers`
12. Select `Settings`tab
13. Go to to the `Variables and Secrets`section
    - Add `UMAMI_WEBSITE_ID` Secret based on the `Website ID` of `www.vanityURLs.link` in the [Umami](https://umami.is)
      account
    - Add `CF_ACCESS_TEAM_DOMAIN` based on the `Team domain` identified in Cloudflare's Main Menu --> Zero Trust -->
      Settings
    - Add `CF_ACCESS_AUD` Secret based on the `Application Audience (AUD) tag` for the Cloudflare Access application
      name defined above that protect `/_stats` and `/_tests`, in the `Additional settings` tab, in the
      `Application Audience (AUD) Tag`section`

14. Load [VanityURLs.link](VanityURLs.link) in your primary browser and [Umami](umami.is) in another browser, let's
    explain why we need two browsers during AI review

- Load several web pages from the website and check if you see them in Umami
