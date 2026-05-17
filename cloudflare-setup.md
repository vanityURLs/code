# Cloudflare Setup

## Account Main Menu --> Workers & Pages
1. Create application
  * Continue Github
  * Select a repository
  * Confirm the Project name as written in the wrangler.toml, in this case website
  * Leave `Build` and `Deploy`as is, the wrangler.toml will take over
  * Deselect builds for non-production branches
2. Add Variables and Secrets
  1. Select `Website Workers`
  2. Select `Settings`tab
  3. Go to to the `Variables and Secrets`section
    * Add `UMAMI_WEBSITE_ID`Secret based from the `Website ID` of `www.vanityURLs.link` in [Umami](umami.is) account
3. Load [VanityURLs.link](VanityURLs.link) in your primary browser and [Umami](umami.is) in another browser, let's explain why we need two browsers during AI review
  * Load several web pages from the website and check if you see them in Umami

