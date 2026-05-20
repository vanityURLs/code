import worker from "./worker.mjs";

let analyticsCalls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  analyticsCalls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  return new Response("ok", { status: 200 });
};

const registry = {
  version: "2.2",
  default_state: "permanent",
  routing: {
    permanent: { type: "redirect", status: 302, target: "link.target" },
    temporary: { type: "redirect", status: 307, target: "link.target" },
    disabled: { type: "error", status: 403 },
    expired: { type: "error", status: 410 },
    deactivated: { type: "error", status: 404 }
  },
  links: [
    {
      slug: "test",
      target: "https://example.com/test",
      state: "permanent",
      description: "Test redirect"
    },
    {
      slug: "docs",
      match: "splat",
      target: "https://example.com/docs/:splat",
      state: "temporary",
      description: "Docs redirect"
    },
    {
      slug: "off",
      target: "https://example.com/off",
      state: "disabled",
      description: "Disabled redirect"
    },
    {
      slug: "hangout",
      target: "https://discord.gg/personal",
      state: "permanent",
      description: "Scheduled hangout redirect",
      schedule: {
        rules: [
          {
            label: "9to5",
            timezone: "America/Toronto",
            days: ["mon", "tue", "wed", "thu", "fri"],
            from: "09:00",
            to: "17:00",
            target: "https://zoom.us/j/work"
          }
        ]
      }
    }
  ]
};

const assets = {
  "/": html("<main>home</main>"),
  "/index.html": html("<main>home</main>"),
  "/privacy.html": html("<main>privacy</main>"),
  "/terms.html": html("<main>terms</main>"),
  "/abuse.html": html("<main>abuse</main>"),
  "/security.html": html("<main>security</main>"),
  "/fr/index.html": html("<main>accueil fr</main>"),
  "/fr/privacy.html": html("<main>confidentialite fr</main>"),
  "/fr/terms.html": html("<main>conditions fr</main>"),
  "/fr/abuse.html": html("<main>abus fr</main>"),
  "/fr/security.html": html("<main>securite fr</main>"),
  "/fr/expand/index.html": html("<main>expand fr</main>"),
  "/disabled.html": html("<main>disabled</main>"),
  "/expired.html": html("<main>expired</main>"),
  "/maintenance.html": html("<main>maintenance</main>"),
  "/404.html": html("<main>{{SLUG_MESSAGE}}{{REFERENCE_LINE}}</main>"),
  "/fr/disabled.html": html("<main>disabled fr</main>"),
  "/fr/expired.html": html("<main>expired fr</main>"),
  "/fr/maintenance.html": html("<main>maintenance fr</main>"),
  "/fr/404.html": html("<main>fr {{SLUG_MESSAGE}}{{REFERENCE_LINE}}</main>"),
  "/_tests/index.html": html("<main>tests</main>"),
  "/style.css": new Response("body{}", {
    headers: { "content-type": "text/css" }
  }),
  "/v8s.json": Response.json(registry),
  "/v8s-blocklist.json": Response.json({
    blocked_keywords: [
      {
        keyword: "/.env",
        category: "scanner-probe",
        source: "runtime-scanner-policy"
      },
      {
        keyword: "wp-login.php",
        category: "scanner-probe",
        source: "runtime-scanner-policy"
      },
      {
        keyword: ".php",
        category: "scanner-probe",
        source: "runtime-scanner-policy"
      },
      {
        keyword: "/wp-content/",
        category: "scanner-probe",
        source: "runtime-scanner-policy"
      }
    ]
  })
};

for (const language of ["es", "it", "de"]) {
  Object.assign(assets, {
    [`/${language}/index.html`]: html(`<main>home ${language}</main>`),
    [`/${language}/privacy.html`]: html(`<main>privacy ${language}</main>`),
    [`/${language}/terms.html`]: html(`<main>terms ${language}</main>`),
    [`/${language}/abuse.html`]: html(`<main>abuse ${language}</main>`),
    [`/${language}/security.html`]: html(`<main>security ${language}</main>`),
    [`/${language}/expand/index.html`]: html(`<main>expand ${language}</main>`),
    [`/${language}/disabled.html`]: html(`<main>disabled ${language}</main>`),
    [`/${language}/expired.html`]: html(`<main>expired ${language}</main>`),
    [`/${language}/maintenance.html`]: html(`<main>maintenance ${language}</main>`),
    [`/${language}/404.html`]: html(`<main>${language} {{SLUG_MESSAGE}}{{REFERENCE_LINE}}</main>`)
  });
}

function html(body) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function cloneResponse(response) {
  return response.clone();
}

function mockAssets() {
  return {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const response = assets[path];

      if (!response) {
        return new Response("asset not found", { status: 404 });
      }

      return cloneResponse(response);
    }
  };
}

function mockCtx() {
  const deferred = [];

  return {
    waitUntil: (promise) => deferred.push(promise),
    flush: () => Promise.all(deferred)
  };
}

function env(overrides = {}) {
  return {
    ASSETS: mockAssets(),
    ANALYTICS_PROVIDER: "umami",
    UMAMI_WEBSITE_ID: "00000000-0000-0000-0000-000000000000",
    UMAMI_ENDPOINT: "https://cloud.umami.is/api/send",
    UMAMI_GEO_IP_MODE: "full",
    ...overrides
  };
}

let accessFixturePromise;

function accessEnv(overrides = {}) {
  return accessFixture().then((fixture) => ({
    ...env({
      CF_ACCESS_TEAM_DOMAIN: fixture.teamDomain,
      CF_ACCESS_AUD: fixture.aud,
      CF_ACCESS_JWKS_JSON: JSON.stringify(fixture.jwks)
    }),
    ...overrides
  }));
}

async function accessHeaders(overrides = {}) {
  const fixture = await accessFixture();
  return {
    "cf-access-jwt-assertion": await signAccessJwt(fixture, overrides)
  };
}

function accessFixture() {
  accessFixturePromise ||= createAccessFixture();
  return accessFixturePromise;
}

async function createAccessFixture() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    aud: "access-aud",
    kid: "test-key",
    privateKey: keyPair.privateKey,
    teamDomain: "team.cloudflareaccess.com",
    jwks: {
      keys: [
        {
          ...publicJwk,
          kid: "test-key",
          alg: "RS256",
          use: "sig"
        }
      ]
    }
  };
}

async function signAccessJwt(fixture, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    kid: fixture.kid,
    typ: "JWT"
  };
  const payload = {
    aud: [fixture.aud],
    email: "bh@dicaire.com",
    exp: now + 300,
    iat: now,
    iss: `https://${fixture.teamDomain}`,
    sub: "user-id",
    ...overrides
  };
  const input = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    fixture.privateKey,
    new TextEncoder().encode(input)
  );

  return `${input}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function request(path, init = {}) {
  return new Request(new URL(path, "https://dicai.re"), {
    ...init,
    headers: {
      "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
      "cf-connecting-ip": "203.0.113.42",
      "user-agent": "Mozilla/5.0 test",
      ...init.headers
    }
  });
}

function jsonRequest(path, body, init = {}) {
  return request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    },
    body: JSON.stringify(body)
  });
}

async function run(name, fn) {
  analyticsCalls = [];

  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    globalThis.fetch = originalFetch;
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

await run("serves homepage from static assets", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/"), env(), ctx);
  assert(response.status === 200, "status");
  assert((await response.text()).includes("accueil fr"), "localized home body");
  assert(response.headers.get("content-language") === "fr", "content language");
  await ctx.flush();
  assert(analyticsCalls.length === 1, "pageview analytics count");
  assert(!("name" in analyticsCalls[0].body.payload), "homepage is regular pageview");
  assert(!("data" in analyticsCalls[0].body.payload), "regular pageview has no event data");
});

await run("serves localized policy and expand pages from Accept-Language", async () => {
  for (const [path, expected] of [
    ["/privacy", "confidentialite fr"],
    ["/terms", "conditions fr"],
    ["/abuse", "abus fr"],
    ["/security", "securite fr"],
    ["/expand", "expand fr"]
  ]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request(path), env(), ctx);
    assert(response.status === 200, `${path} status`);
    assert((await response.text()).includes(expected), `${path} localized body`);
    assert(response.headers.get("content-language") === "fr", `${path} content language`);
    await ctx.flush();
  }
});

await run("serves localized status pages from Accept-Language", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/missing"), env(), ctx);
  const body = await response.text();
  await ctx.flush();
  assert(response.status === 404, "status");
  assert(body.includes("fr"), "localized body");
  assert(response.headers.get("content-language") === "fr", "content language");
  assert((response.headers.get("vary") || "").includes("Accept-Language"), "vary header");
});

await run("serves Spanish, Italian, and German pages from Accept-Language", async () => {
  for (const language of ["es", "it", "de"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request("/", {
      headers: { "accept-language": `${language};q=1,en;q=0.5` }
    }), env(), ctx);
    assert(response.status === 200, `${language} status`);
    assert((await response.text()).includes(`home ${language}`), `${language} localized body`);
    assert(response.headers.get("content-language") === language, `${language} content language`);
    await ctx.flush();
  }
});

await run("serves extensionless policy page aliases", async () => {
  for (const path of ["/index", "/privacy", "/terms", "/abuse", "/trust-safety", "/security"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request(path, {
      headers: {
        "accept-language": "en-CA,en;q=0.9"
      }
    }), env(), ctx);
    assert(response.status === 200, `${path} status`);
    const body = await response.text();
    const expected = path === "/index" ? "home" : path === "/trust-safety" ? "abuse" : path.slice(1);
    assert(body.includes(expected), `${path} body`);
    await ctx.flush();
  }
  assert(analyticsCalls.length === 6, "pageview count");
  assert(analyticsCalls.every((call) => !("name" in call.body.payload)), "regular pageviews");
});

await run("blocks raw registry asset", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/v8s.json"), env(), ctx);
  assert(response.status === 404, "status");
  assert(response.headers.get("x-robots-tag") === "noindex, nofollow", "robots header");
});

await run("blocks raw runtime blocklist asset", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/v8s-blocklist.json"), env(), ctx);
  assert(response.status === 404, "status");
  assert(response.headers.get("x-robots-tag") === "noindex, nofollow", "robots header");
});

await run("blocks raw site config asset", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/v8s-site-config.json"), env(), ctx);
  assert(response.status === 404, "status");
  assert(response.headers.get("x-robots-tag") === "noindex, nofollow", "robots header");
});

await run("requires Cloudflare Access config for protected paths", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_tests"), env(), ctx);
  assert(response.status === 503, "status");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("requires Cloudflare Access token for protected paths", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats"), await accessEnv(), ctx);
  assert(response.status === 403, "status");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("protects non-GET requests to protected paths before method handling", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats", { method: "POST" }), await accessEnv(), ctx);
  assert(response.status === 403, "status");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("serves tests page with valid Cloudflare Access token", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_tests", {
    headers: {
      ...(await accessHeaders())
    }
  }), await accessEnv(), ctx);
  assert(response.status === 200, "status");
  assert((await response.text()).includes("tests"), "body");
});

await run("protects direct tests asset path with Cloudflare Access", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_tests/index.html"), await accessEnv(), ctx);
  assert(response.status === 403, "status");
});

await run("rejects Cloudflare Access tokens with the wrong audience", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_tests", {
    headers: {
      ...(await accessHeaders({ aud: ["wrong-aud"] }))
    }
  }), await accessEnv(), ctx);
  assert(response.status === 403, "status");
});

await run("rejects unsupported methods on public paths", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/test", { method: "POST" }), env(), ctx);
  assert(response.status === 405, "status");
  assert(response.headers.get("allow") === "GET, HEAD, OPTIONS", "allow header");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("answers public options requests without analytics", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/test", { method: "OPTIONS" }), env(), ctx);
  assert(response.status === 204, "status");
  assert(response.headers.get("allow") === "GET, HEAD, OPTIONS", "allow header");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("blocks scanner probe paths before short-link lookup", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/.env"), env(), ctx);
  await ctx.flush();
  assert(response.status === 404, "status");
  assert(response.headers.get("x-deny-category") === "scanner-probe", "deny category");
  assert(analyticsCalls.length === 0, "scanner probes do not pollute analytics");
});

await run("blocks PHP and WordPress scanner probes", async () => {
  for (const path of ["/file.php", "/css/index.php", "/wp-content/plugins/test/readme.txt"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request(path), env(), ctx);
    await ctx.flush();
    assert(response.status === 404, `${path} status`);
    assert(response.headers.get("x-deny-category") === "scanner-probe", `${path} deny category`);
  }
  assert(analyticsCalls.length === 0, "scanner probes do not pollute analytics");
});

await run("exposes registry through stats API", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats/api/v8s.json", {
    headers: {
      ...(await accessHeaders())
    }
  }), await accessEnv(), ctx);
  assert(response.status === 200, "status");
  assert(response.headers.get("content-disposition") === 'attachment; filename="v8s.json"', "download header");
  assert((await response.json()).links.length === 4, "registry body");
});

await run("summarizes redirects through stats API", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats/api/redirects", {
    headers: {
      ...(await accessHeaders())
    }
  }), await accessEnv(), ctx);
  const body = await response.json();
  assert(response.status === 200, "status");
  assert(body.total === 4, "total links");
  assert(body.static === 3, "static count");
  assert(body.dynamic === 1, "dynamic count");
});

await run("tracks expand preview lookups", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(jsonRequest("/_analytics/expand", {
    slug: "test",
    state: "permanent",
    target: "https://example.com/test",
    result: "resolved"
  }), env(), ctx);
  await ctx.flush();
  assert(response.status === 204, "status");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "expand", "event name");
  assert(analyticsCalls[0].body.payload.data.slug === "test", "slug");
  assert(analyticsCalls[0].body.payload.data.effective_state === "permanent", "state");
  assert(analyticsCalls[0].body.payload.data.target_host === "example.com", "target host");
  assert(analyticsCalls[0].body.payload.data.expand_result === "resolved", "result");
});

await run("rejects non-POST expand analytics requests", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_analytics/expand"), env(), ctx);
  await ctx.flush();
  assert(response.status === 405, "status");
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("redirects exact short link and tracks event", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/test"), env(), ctx);
  await ctx.flush();
  assert(response.status === 302, "status");
  assert(response.headers.get("location") === "https://example.com/test", "location");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "redirect", "event name");
  assert(analyticsCalls[0].body.payload.userAgent === "Mozilla/5.0 test", "visitor UA");
  assert(analyticsCalls[0].body.payload.ip === "203.0.113.42", "full visitor IP");
  assert(analyticsCalls[0].body.payload.language === "fr-CA", "first language only");
});

await run("uses scheduled target during active time window", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/hangout"), env({
    V8S_NOW: "2026-05-11T14:00:00Z"
  }), ctx);
  await ctx.flush();
  assert(response.status === 302, "status");
  assert(response.headers.get("location") === "https://zoom.us/j/work", "location");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "redirect", "event name");
  assert(analyticsCalls[0].body.payload.data.slug === "hangout", "slug");
  assert(analyticsCalls[0].body.payload.data.schedule_label === "9to5", "schedule label");
  assert(analyticsCalls[0].body.payload.data.target_host === "zoom.us", "target host");
});

await run("uses default target outside scheduled time window", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/hangout"), env({
    V8S_NOW: "2026-05-11T23:00:00Z"
  }), ctx);
  await ctx.flush();
  assert(response.status === 302, "status");
  assert(response.headers.get("location") === "https://discord.gg/personal", "location");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.data.schedule_label === "", "schedule label");
  assert(analyticsCalls[0].body.payload.data.target_host === "discord.gg", "target host");
});

await run("refuses unsafe registry redirect targets at runtime", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    links: [
      {
        slug: "bad",
        target: "javascript:alert(1)",
        state: "permanent"
      }
    ]
  });

  try {
    const ctx = mockCtx();
    const response = await worker.fetch(request("/bad"), env(), ctx);
    await ctx.flush();
    assert(response.status === 404, "status");
    assert(!response.headers.has("location"), "no redirect location");
    assert(analyticsCalls.length === 2, "unsafe redirect analytics count");
    assert(analyticsCalls[0].body.payload.name === "short-link-miss", "event name");
    assert(analyticsCalls[0].body.payload.data.redirect_error === "unsafe-target", "redirect error");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
});

await run("refuses unsafe route redirect targets at runtime", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    routing: {
      ...registry.routing,
      permanent: { type: "redirect", status: 302, target: "//spam.example/path" }
    }
  });

  try {
    const ctx = mockCtx();
    const response = await worker.fetch(request("/test"), env(), ctx);
    await ctx.flush();
    assert(response.status === 404, "status");
    assert(!response.headers.has("location"), "no redirect location");
    assert(analyticsCalls[0].body.payload.data.redirect_error === "unsafe-target", "redirect error");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
});

await run("caps long Accept-Language headers for Umami", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test", {
    headers: {
      "accept-language": "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz,en;q=0.9"
    }
  }), env(), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.language.length === 35, "language length");
});

await run("supports truncated IP mode for privacy-focused deployments", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/test"), env({ UMAMI_GEO_IP_MODE: "truncated" }), ctx);
  await ctx.flush();
  assert(response.status === 302, "status");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.ip === "203.0.113.0", "truncated IP");
});

await run("supports disabling IP override", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test"), env({ UMAMI_GEO_IP_MODE: "none" }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 1, "analytics count");
  assert(!("ip" in analyticsCalls[0].body.payload), "IP omitted");
});

await run("uses browser-like outbound user agent for CLI requests", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test", {
    headers: {
      "user-agent": "curl/8.0.0"
    }
  }), env(), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "bot", "event is classified as bot");
  assert(analyticsCalls[0].body.payload.data.bot_name === "CLI", "bot family");
  assert(analyticsCalls[0].body.payload.data.bot_event_type === "redirect", "original event type");
  assert(analyticsCalls[0].body.payload.userAgent === "curl/8.0.0", "payload keeps visitor UA");
  assert(analyticsCalls[0].init.headers["user-agent"].startsWith("Mozilla/5.0"), "outbound UA fallback");
});

await run("can preserve original event names for bot traffic", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/missing", {
    headers: {
      "user-agent": "Googlebot/2.1"
    }
  }), env({ UMAMI_BOT_MODE: "original" }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 2, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "short-link-miss", "original event name");
  assert(analyticsCalls[0].body.payload.data.bot_name === "Googlebot", "bot family");
  assert(!("name" in analyticsCalls[1].body.payload), "404 pageview remains pageview");
});

await run("skips analytics when Umami website id is absent", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test"), env({ UMAMI_WEBSITE_ID: "" }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 0, "analytics skipped");
});

await run("tracks Fathom events when configured as provider", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test"), env({
    ANALYTICS_PROVIDER: "fathom",
    FATHOM_SITE_ID: "ABCDEFG"
  }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 1, "analytics count");
  const url = new URL(analyticsCalls[0].url);
  assert(url.origin + url.pathname === "https://cdn.usefathom.com/", "fathom endpoint");
  assert(url.searchParams.get("sid") === "ABCDEFG", "site id");
  assert(url.searchParams.get("name") === "redirect", "event name");
  assert(url.searchParams.get("h") === "https://dicai.re", "hostname");
  assert(url.searchParams.get("p") === "/test", "path");
  assert(url.searchParams.get("r") === "", "referrer");
  assert(JSON.parse(url.searchParams.get("payload")).slug === "test", "payload slug");
});

await run("can send analytics to Umami and Fathom together", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/test"), env({
    ANALYTICS_PROVIDER: "umami,fathom",
    FATHOM_SITE_ID: "ABCDEFG"
  }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 2, "analytics count");
  assert(analyticsCalls[0].url === "https://cloud.umami.is/api/send", "umami endpoint");
  assert(new URL(analyticsCalls[1].url).origin + new URL(analyticsCalls[1].url).pathname === "https://cdn.usefathom.com/", "fathom endpoint");
});

await run("supports Fathom endpoint overrides", async () => {
  const ctx = mockCtx();
  await worker.fetch(request("/privacy"), env({
    ANALYTICS_PROVIDER: "fathom",
    FATHOM_SITE_ID: "ABCDEFG",
    FATHOM_ENDPOINT: "https://stats.example.com"
  }), ctx);
  await ctx.flush();
  assert(analyticsCalls.length === 1, "analytics count");
  const url = new URL(analyticsCalls[0].url);
  assert(url.origin + url.pathname === "https://stats.example.com/", "custom endpoint");
  assert(!url.searchParams.has("name"), "pageview has no event name");
  assert(url.searchParams.get("p") === "/privacy", "pageview path");
  assert(!("authorization" in analyticsCalls[0].init.headers), "no management token sent");
});

await run("redirects splat short link", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/docs/page-1"), env(), ctx);
  await ctx.flush();
  assert(response.status === 307, "status");
  assert(response.headers.get("location") === "https://example.com/docs/page-1", "location");
});

await run("encodes splat values before redirecting", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/docs/a%3Futm=spam"), env(), ctx);
  await ctx.flush();
  assert(response.status === 307, "status");
  assert(response.headers.get("location") === "https://example.com/docs/a%3Futm%3Dspam", "location");
});

await run("renders disabled state page", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/off"), env(), ctx);
  await ctx.flush();
  assert(response.status === 403, "status");
  assert((await response.text()).includes("disabled"), "body");
  assert(analyticsCalls.length === 2, "disabled state analytics count");
  assert(analyticsCalls[0].body.payload.name === "short-link-miss", "state event");
  assert(!("name" in analyticsCalls[1].body.payload), "state pageview");
});

await run("tracks direct state and not-found pages", async () => {
  for (const path of ["/expired", "/disabled", "/maintenance", "/404"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request(path), env(), ctx);
    await ctx.flush();
    assert(response.headers.get("content-type").startsWith("text/html"), `${path} html`);
  }
  assert(analyticsCalls.length === 4, "state pageview count");
  assert(analyticsCalls.every((call) => !("name" in call.body.payload)), "state pages are pageviews");
});

await run("renders custom 404 for missed short links and tracks miss", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/missing"), env(), ctx);
  await ctx.flush();
  const body = await response.text();
  assert(response.status === 404, "status");
  assert(body.includes("missing"), "slug message");
  assert(response.headers.get("x-correlation-id"), "correlation header");
  assert(analyticsCalls.length === 2, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "short-link-miss", "event name");
  assert(!("name" in analyticsCalls[1].body.payload), "404 pageview");
});

await run("passes static file extensions to assets", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/style.css"), env(), ctx);
  assert(response.status === 200, "status");
  assert(response.headers.get("content-type") === "text/css", "content type");
});

globalThis.fetch = originalFetch;
