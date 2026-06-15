import worker from "./worker.mjs";

let analyticsCalls = [];
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

console.warn = () => {};

globalThis.fetch = async (url, init) => {
  analyticsCalls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  return new Response("ok", { status: 200 });
};

function createRegistryTree(links) {
  const root = { children: {} };

  for (const link of links) {
    const segments = link.slug.split("/").filter(Boolean);
    let node = root;

    for (const segment of segments) {
      node.children[segment] ||= { children: {} };
      node = node.children[segment];
    }

    if (link.match === "splat") {
      node.splat_link = link;
    } else {
      node.link = link;
    }
  }

  return root;
}

const registryLinks = [
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
    slug: "sab",
    target: "https://example.com/sab",
    state: "permanent",
    description: "Simple lookup redirect"
  },
  {
    slug: "d/gv",
    target: "https://example.com/d/gv",
    state: "permanent",
    description: "Nested lookup redirect"
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
];

const registry = {
  schema_version: "3.0",
  default_state: "permanent",
  routing: {
    permanent: { type: "redirect", status: 302, target: "link.target" },
    temporary: { type: "redirect", status: 307, target: "link.target" },
    disabled: { type: "error", status: 403 },
    expired: { type: "error", status: 410 },
    deactivated: { type: "error", status: 404 }
  },
  tree: createRegistryTree(registryLinks)
};

const assets = {
  "/": html("<main>home</main>"),
  "/index.html": html("<main>home</main>"),
  "/privacy.html": html("<main>privacy</main>"),
  "/terms.html": html("<main>terms</main>"),
  "/abuse.html": html("<main>abuse</main>"),
  "/security.html": html("<main>security</main>"),
  "/en/index.html": html("<main>home en</main>"),
  "/en/lookup/index.html": html("<main>lookup en</main>"),
  "/fr/index.html": html("<main>accueil fr</main>"),
  "/fr/privacy.html": html("<main>confidentialite fr</main>"),
  "/fr/terms.html": html("<main>conditions fr</main>"),
  "/fr/abuse.html": html("<main>abus fr</main>"),
  "/fr/security.html": html("<main>securite fr</main>"),
  "/fr/lookup/index.html": html("<main>lookup fr</main>"),
  "/disabled.html": html("<main>disabled</main>"),
  "/expired.html": html("<main>expired</main>"),
  "/maintenance.html": html("<main>maintenance</main>"),
  "/404.html": html("<main>{{SLUG_MESSAGE}}{{REFERENCE_LINE}}</main>"),
  "/fr/disabled.html": html("<main>disabled fr</main>"),
  "/fr/expired.html": html("<main>expired fr</main>"),
  "/fr/maintenance.html": html("<main>maintenance fr</main>"),
  "/fr/404.html": html("<main>fr {{SLUG_MESSAGE}}{{REFERENCE_LINE}}</main>"),
  "/_tests/index.html": html("<main>tests</main>"),
  "/en/_stats/index.html": html("<main>stats en</main>"),
  "/fr/_stats/index.html": html("<main>stats fr</main>"),
  "/.well-known/security.txt": new Response("Contact: mailto:security@example.com\n", {
    headers: { "content-type": "text/plain; charset=utf-8" }
  }),
  "/v8s-style.css": new Response("body{}", {
    headers: { "content-type": "text/css" }
  }),
  "/custom-header.html": new Response("<main>custom header</main>", {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'"
    }
  }),
  "/custom-page.html": html("<main>custom page</main>"),
  "/v8s.json": Response.json(registry),
  "/v8s-custom-assets.json": Response.json({
    schema_version: 1,
    paths: ["/custom-page.html", "/v8s-style.css"]
  }),
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
        source: "runtime-scanner-policy",
        scope: "request"
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
    [`/${language}/lookup/index.html`]: html(`<main>lookup ${language}</main>`),
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
  const { header: headerOverrides = {}, ...payloadOverrides } = overrides;
  const header = {
    alg: "RS256",
    kid: fixture.kid,
    typ: "JWT",
    ...headerOverrides
  };
  const payload = {
    aud: [fixture.aud],
    email: "bh@dicaire.com",
    exp: now + 300,
    iat: now,
    iss: `https://${fixture.teamDomain}`,
    sub: "user-id",
    ...payloadOverrides
  };
  const input = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", fixture.privateKey, new TextEncoder().encode(input));

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

function corruptJwtSignature(token) {
  const parts = token.split(".");
  const signature = base64UrlToBytesForTest(parts[2]);
  signature[0] = signature[0] ^ 0xff;
  return `${parts[0]}.${parts[1]}.${base64UrlBytes(signature)}`;
}

function base64UrlToBytesForTest(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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
    console.warn = originalWarn;
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertSecurityHeaders(response) {
  const csp = response.headers.get("content-security-policy") || "";
  assert(csp.includes("frame-ancestors 'none'"), "csp frame ancestors");
  assert(csp.includes("connect-src 'self' https://api.github.com"), "csp connect sources");
  assert(!csp.includes("'unsafe-inline'"), "csp rejects inline code");
  assert(
    response.headers.get("permissions-policy") === "camera=(), microphone=(), geolocation=()",
    "permissions policy"
  );
  assert(response.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "referrer policy");
  assert(response.headers.get("strict-transport-security") === "max-age=31536000", "hsts");
  assert(response.headers.get("x-content-type-options") === "nosniff", "content type options");
  assert(response.headers.get("x-frame-options") === "DENY", "frame options");
}

await run("recovers runtime blocklist loading after a transient asset failure", async () => {
  let blocklistCalls = 0;
  const recoveryEnv = env({
    ASSETS: {
      fetch: async (assetRequest) => {
        const path = new URL(assetRequest.url).pathname;
        if (path === "/v8s-blocklist.json") {
          blocklistCalls += 1;
          if (blocklistCalls === 1) {
            throw new Error("simulated blocklist asset failure");
          }
          return cloneResponse(assets["/v8s-blocklist.json"]);
        }
        return mockAssets().fetch(assetRequest);
      }
    }
  });

  const first = await worker.fetch(request("/.env"), recoveryEnv, mockCtx());
  assert(first.status === 404, "first request still fails closed as a regular miss");
  assert(first.headers.get("x-deny-category") === null, "first request has no deny category");

  const second = await worker.fetch(request("/.env"), recoveryEnv, mockCtx());
  assert(second.status === 404, "second request status");
  assert(second.headers.get("x-deny-category") === "scanner-probe", "second request uses recovered blocklist");
  assert(blocklistCalls === 2, "blocklist fetch retried");
});

await run("serves homepage from static assets", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/"), env(), ctx);
  assert(response.status === 200, "status");
  assertSecurityHeaders(response);
  assert((await response.text()).includes("accueil fr"), "localized home body");
  assert(response.headers.get("content-language") === "fr", "content language");
  await ctx.flush();
  assert(analyticsCalls.length === 1, "pageview analytics count");
  assert(!("name" in analyticsCalls[0].body.payload), "homepage is regular pageview");
  assert(!("data" in analyticsCalls[0].body.payload), "regular pageview has no event data");
});

await run("serves localized policy and lookup pages from Accept-Language", async () => {
  for (const [path, expected] of [
    ["/privacy", "confidentialite fr"],
    ["/terms", "conditions fr"],
    ["/abuse", "abus fr"],
    ["/security", "securite fr"],
    ["/lookup", "lookup fr"]
  ]) {
    const ctx = mockCtx();
    const response = await worker.fetch(request(path), env(), ctx);
    assert(response.status === 200, `${path} status`);
    assert((await response.text()).includes(expected), `${path} localized body`);
    assert(response.headers.get("content-language") === "fr", `${path} content language`);
    await ctx.flush();
  }
});

await run("serves localized lookup aliases", async () => {
  for (const [path, expected] of [
    ["/en/lookup", "lookup en"],
    ["/en/lookup/", "lookup en"],
    ["/fr/lookup", "lookup fr"],
    ["/fr/lookup/", "lookup fr"],
    ["/fr/consultation", "lookup fr"],
    ["/es/consulta", "lookup es"],
    ["/it/consulta", "lookup it"],
    ["/de/abfrage", "lookup de"]
  ]) {
    const response = await worker.fetch(request(path), env(), mockCtx());
    assert(response.status === 200, `${path} status`);
    assert((await response.text()).includes(expected), `${path} localized lookup body`);
  }
});

await run("serves localized directory page aliases", async () => {
  for (const [path, expected] of [
    ["/en", "home en"],
    ["/en/", "home en"],
    ["/fr", "accueil fr"],
    ["/fr/", "accueil fr"],
    ["/fr/index", "accueil fr"],
    ["/fr/abuse", "abus fr"],
    ["/fr/trust-safety", "abus fr"]
  ]) {
    const response = await worker.fetch(request(path), env(), mockCtx());
    assert(response.status === 200, `${path} status`);
    assert((await response.text()).includes(expected), `${path} body`);
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
    const response = await worker.fetch(
      request("/", {
        headers: { "accept-language": `${language};q=1,en;q=0.5` }
      }),
      env(),
      ctx
    );
    assert(response.status === 200, `${language} status`);
    assert((await response.text()).includes(`home ${language}`), `${language} localized body`);
    assert(response.headers.get("content-language") === language, `${language} content language`);
    await ctx.flush();
  }
});

await run("serves extensionless policy page aliases", async () => {
  for (const path of ["/index", "/privacy", "/terms", "/abuse", "/trust-safety", "/security"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(
      request(path, {
        headers: {
          "accept-language": "en-CA,en;q=0.9"
        }
      }),
      env(),
      ctx
    );
    assert(response.status === 200, `${path} status`);
    const body = await response.text();
    const expected = path === "/index" ? "home" : path === "/trust-safety" ? "abuse" : path.slice(1);
    assert(body.includes(expected), `${path} body`);
    await ctx.flush();
  }
  assert(analyticsCalls.length === 6, "pageview count");
  assert(
    analyticsCalls.every((call) => !("name" in call.body.payload)),
    "regular pageviews"
  );
});

await run("applies security headers across response classes and preserves explicit headers", async () => {
  for (const [name, response] of [
    ["html asset", await worker.fetch(request("/privacy"), env(), mockCtx())],
    ["json api", await worker.fetch(jsonRequest("/lookup/resolve", { slug: "test" }), env(), mockCtx())],
    ["not found", await worker.fetch(request("/missing"), env(), mockCtx())],
    ["protected", await worker.fetch(request("/_tests"), env(), mockCtx())],
    ["static asset", await worker.fetch(request("/v8s-style.css"), env(), mockCtx())]
  ]) {
    assertSecurityHeaders(response);
    assert(response.headers.get("content-security-policy"), `${name} csp`);
  }

  const custom = await worker.fetch(request("/custom-header.html"), env(), mockCtx());
  assert(custom.headers.get("content-security-policy") === "default-src 'none'", "explicit csp preserved");
  assert(custom.headers.get("x-frame-options") === "DENY", "other security headers still added");
});

await run("applies sandboxed CSP only to custom HTML assets", async () => {
  const custom = await worker.fetch(request("/custom-page.html"), env(), mockCtx());
  const csp = custom.headers.get("content-security-policy") || "";
  assert(csp.includes("sandbox allow-scripts"), "custom html sandbox");
  assert(csp.includes("'unsafe-inline'"), "custom html allows inline assets");
  assert(!custom.headers.has("x-v8s-asset-path"), "internal asset path stripped");

  const css = await worker.fetch(request("/v8s-style.css"), env(), mockCtx());
  assert(!css.headers.get("content-security-policy").includes("sandbox"), "custom non-html keeps default csp");
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

await run("blocks raw custom assets manifest", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/v8s-custom-assets.json"), env(), ctx);
  assert(response.status === 404, "status");
  assert(response.headers.get("x-robots-tag") === "noindex, nofollow", "robots header");
});

await run("resolves public lookup API for exact and nested slugs", async () => {
  for (const [slug, expectedTarget] of [
    ["sab", "https://example.com/sab"],
    ["d/gv", "https://example.com/d/gv"],
    ["docs/page-1", "https://example.com/docs/page-1"]
  ]) {
    const response = await worker.fetch(jsonRequest("/lookup/resolve", { slug }), env(), mockCtx());
    assert(response.status === 200, `${slug} status`);
    assertSecurityHeaders(response);
    assert(response.headers.get("x-robots-tag") === "noindex, nofollow", `${slug} robots header`);
    const body = await response.json();
    assert(body.result === "resolved", `${slug} result`);
    assert(body.slug === slug, `${slug} body slug`);
    assert(body.target === expectedTarget, `${slug} target`);
  }
});

await run("allows sandboxed custom pages to call public lookup endpoints with null origin", async () => {
  const lookup = await worker.fetch(
    jsonRequest("/lookup/resolve", { slug: "test" }, { headers: { origin: "null" } }),
    env(),
    mockCtx()
  );
  assert(lookup.status === 200, "lookup status");
  assert(lookup.headers.get("access-control-allow-origin") === "null", "lookup cors origin");
  assert((lookup.headers.get("vary") || "").includes("Origin"), "lookup vary");

  const preflight = await worker.fetch(
    request("/lookup/resolve", {
      method: "OPTIONS",
      headers: {
        origin: "null",
        "access-control-request-method": "POST"
      }
    }),
    env(),
    mockCtx()
  );
  assert(preflight.status === 204, "preflight status");
  assert(preflight.headers.get("access-control-allow-origin") === "null", "preflight cors origin");
  assert(preflight.headers.get("access-control-allow-methods") === "POST, OPTIONS", "preflight methods");

  const analytics = await worker.fetch(
    request("/_analytics/lookup", {
      method: "POST",
      headers: {
        origin: "null",
        "content-type": "application/json"
      },
      body: JSON.stringify({ slug: "test", result: "resolved" })
    }),
    env(),
    mockCtx()
  );
  assert(analytics.status === 204, "analytics status");
  assert(analytics.headers.get("access-control-allow-origin") === "null", "analytics cors origin");

  const protectedPreflight = await worker.fetch(
    request("/en/_stats/api/v8s.json", {
      method: "OPTIONS",
      headers: {
        origin: "null",
        "access-control-request-method": "GET"
      }
    }),
    env(),
    mockCtx()
  );
  assert(!protectedPreflight.headers.has("access-control-allow-origin"), "protected endpoint has no cors origin");
});

await run("returns public lookup API miss and non-redirecting results", async () => {
  const miss = await worker.fetch(jsonRequest("/lookup/resolve", { slug: "missing" }), env(), mockCtx());
  assert(miss.status === 200, "miss status");
  assert((await miss.json()).result === "miss", "miss result");

  const disabled = await worker.fetch(jsonRequest("/lookup/resolve", { slug: "off" }), env(), mockCtx());
  assert(disabled.status === 200, "disabled status");
  const body = await disabled.json();
  assert(body.result === "not-redirecting", "disabled result");
  assert(body.state === "disabled", "disabled state");
  assert(!("target" in body), "disabled result does not leak target");
});

await run("keeps public lookup API private to clients and robots", async () => {
  const empty = await worker.fetch(jsonRequest("/lookup/resolve", {}), env(), mockCtx());
  assert(empty.status === 200, "empty status");
  assert(empty.headers.get("cache-control") === "no-store", "cache control");
  assert(empty.headers.get("x-robots-tag") === "noindex, nofollow", "robots header");
  assert((await empty.json()).slug === "", "empty slug");

  const get = await worker.fetch(request("/lookup/resolve"), env(), mockCtx());
  assert(get.status === 405, "get status");
  assert(get.headers.get("allow") === "POST", "get allow header");

  const longSlug = "a".repeat(512);
  const long = await worker.fetch(jsonRequest("/lookup/resolve", { slug: longSlug }), env(), mockCtx());
  const body = await long.json();
  assert(long.status === 200, "long slug status");
  assert(body.result === "miss", "long slug miss");
  assert(body.slug === longSlug.slice(0, 99), "long slug is capped before echoing");
});

await run("removes legacy underscore lookup API", async () => {
  const response = await worker.fetch(request("/_lookup?slug=test"), env(), mockCtx());
  assert(response.status === 404, "legacy lookup status");
});

await run("redirects legacy security.txt to well-known security.txt", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/security.txt"), env(), ctx);
  assert(response.status === 308, "status");
  assert(response.headers.get("location") === "https://dicai.re/.well-known/security.txt", "location");
});

await run("serves canonical well-known security.txt", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/.well-known/security.txt"), env(), ctx);
  const body = await response.text();
  assert(response.status === 200, "status");
  assert(body.includes("Contact: mailto:security@example.com"), "body");
});

await run("redirects mixed-case well-known security.txt to canonical path", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/.Well-known/security.txt"), env(), ctx);
  assert(response.status === 308, "status");
  assert(response.headers.get("location") === "https://dicai.re/.well-known/security.txt", "location");
});

await run("requires Cloudflare Access config for protected paths", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/en/_tests/"), env(), ctx);
  assert(response.status === 503, "status");
  assertSecurityHeaders(response);
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("requires Cloudflare Access token for protected paths", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/en/_stats/"), await accessEnv(), ctx);
  assert(response.status === 403, "status");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("protects non-GET requests to protected paths before method handling", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/en/_stats/", { method: "POST" }), await accessEnv(), ctx);
  assert(response.status === 403, "status");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("redirects legacy stats page paths to English stats", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats"), env(), ctx);
  assert(response.status === 308, "status");
  assert(response.headers.get("location") === "https://dicai.re/en/_stats/", "location");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("redirects legacy stats API paths to English stats API", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_stats/api/v8s.json"), env(), ctx);
  assert(response.status === 308, "status");
  assert(response.headers.get("location") === "https://dicai.re/en/_stats/api/v8s.json", "location");
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("redirects legacy tests page paths to English tests", async () => {
  const ctx = mockCtx();
  for (const path of ["/_tests", "/_tests/", "/_tests/index.html", "/_tests/runtime.html"]) {
    const response = await worker.fetch(request(path), env(), ctx);
    assert(response.status === 308, `${path} status`);
    assert(response.headers.get("location") === "https://dicai.re/en/_tests/", `${path} location`);
  }
  await ctx.flush();
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("serves localized tests page aliases with valid Cloudflare Access token", async () => {
  for (const path of ["/en/_tests/", "/fr/_tests/", "/fr/_tests/index.html"]) {
    const ctx = mockCtx();
    const response = await worker.fetch(
      request(path, {
        headers: {
          ...(await accessHeaders())
        }
      }),
      await accessEnv(),
      ctx
    );
    assert(response.status === 200, `${path} status`);
    assert((await response.text()).includes("tests"), `${path} body`);
  }
});

await run("serves localized stats page with valid Cloudflare Access token", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    request("/fr/_stats/", {
      headers: {
        ...(await accessHeaders())
      }
    }),
    await accessEnv(),
    ctx
  );
  assert(response.status === 200, "status");
  assert((await response.text()).includes("stats fr"), "body");
});

await run("serves English stats page with valid Cloudflare Access token", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    request("/en/_stats/", {
      headers: {
        ...(await accessHeaders())
      }
    }),
    await accessEnv(),
    ctx
  );
  assert(response.status === 200, "status");
  assert((await response.text()).includes("stats en"), "body");
});

await run("protects direct tests asset path with Cloudflare Access", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/en/_tests/index.html"), await accessEnv(), ctx);
  assert(response.status === 403, "status");
});

await run("protects localized tests page aliases with Cloudflare Access", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/en/_tests/"), await accessEnv(), ctx);
  assert(response.status === 403, "status");
});

await run("rejects Cloudflare Access tokens with the wrong audience", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    request("/en/_tests/", {
      headers: {
        ...(await accessHeaders({ aud: ["wrong-aud"] }))
      }
    }),
    await accessEnv(),
    ctx
  );
  assert(response.status === 403, "status");
});

await run("rejects malformed Cloudflare Access JWTs", async () => {
  for (const token of ["not-a-jwt", "a.b.c", `${base64UrlJson({ alg: "RS256" })}.payload.signature`]) {
    const ctx = mockCtx();
    const response = await worker.fetch(
      request("/en/_tests/", {
        headers: {
          "cf-access-jwt-assertion": token
        }
      }),
      await accessEnv(),
      ctx
    );
    assert(response.status === 403, "status");
  }
});

await run("rejects Cloudflare Access tokens with invalid JWT claims", async () => {
  const now = Math.floor(Date.now() / 1000);

  for (const [name, overrides] of [
    ["expired", { exp: now - 120 }],
    ["future nbf", { nbf: now + 120 }],
    ["future iat", { iat: now + 120 }],
    ["wrong issuer", { iss: "https://other.cloudflareaccess.com" }]
  ]) {
    const ctx = mockCtx();
    const response = await worker.fetch(
      request("/en/_tests/", {
        headers: {
          ...(await accessHeaders(overrides))
        }
      }),
      await accessEnv(),
      ctx
    );
    assert(response.status === 403, `${name} status`);
  }
});

await run("rejects Cloudflare Access tokens with invalid JWT headers or signatures", async () => {
  const fixture = await accessFixture();
  const missingKid = await signAccessJwt(fixture, { header: { kid: "" } });
  const wrongAlgorithm = await signAccessJwt(fixture, { header: { alg: "HS256" } });
  const valid = await signAccessJwt(fixture);
  const invalidSignature = corruptJwtSignature(valid);

  for (const [name, token] of [
    ["missing kid", missingKid],
    ["wrong algorithm", wrongAlgorithm],
    ["invalid signature", invalidSignature]
  ]) {
    const ctx = mockCtx();
    const response = await worker.fetch(
      request("/en/_tests/", {
        headers: {
          "cf-access-jwt-assertion": token
        }
      }),
      await accessEnv(),
      ctx
    );
    assert(response.status === 403, `${name} status`);
  }
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
  const response = await worker.fetch(
    request("/en/_stats/api/v8s.json", {
      headers: {
        ...(await accessHeaders())
      }
    }),
    await accessEnv(),
    ctx
  );
  assert(response.status === 200, "status");
  assert(response.headers.get("content-disposition") === 'attachment; filename="v8s.json"', "download header");
  const body = await response.json();
  assert(body.tree.children.test.link.slug === "test", "runtime link registry tree body");
  assert(!("links" in body), "runtime link registry omits links[]");
});

await run("summarizes redirects through stats API", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    request("/en/_stats/api/redirects", {
      headers: {
        ...(await accessHeaders())
      }
    }),
    await accessEnv(),
    ctx
  );
  const body = await response.json();
  assert(response.status === 200, "status");
  assert(body.total === 6, "total links");
  assert(body.static === 5, "static count");
  assert(body.dynamic === 1, "dynamic count");
});

await run("tracks lookup requests", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    jsonRequest("/_analytics/lookup", {
      slug: "test",
      state: "permanent",
      target: "https://example.com/test",
      result: "resolved"
    }),
    env(),
    ctx
  );
  await ctx.flush();
  assert(response.status === 204, "status");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "lookup", "event name");
  assert(analyticsCalls[0].body.payload.data.slug === "test", "slug");
  assert(analyticsCalls[0].body.payload.data.effective_state === "permanent", "state");
  assert(analyticsCalls[0].body.payload.data.target_host === "example.com", "target host");
  assert(analyticsCalls[0].body.payload.data.lookup_result === "resolved", "result");
});

await run("rejects non-POST lookup analytics requests", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/_analytics/lookup"), env(), ctx);
  await ctx.flush();
  assert(response.status === 405, "status");
  assert(analyticsCalls.length === 0, "no analytics");
});

await run("redirects exact short link and tracks event", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/test"), env(), ctx);
  await ctx.flush();
  assert(response.status === 302, "status");
  assertSecurityHeaders(response);
  assert(response.headers.get("location") === "https://example.com/test", "location");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "redirect", "event name");
  assert(analyticsCalls[0].body.payload.userAgent === "Mozilla/5.0 test", "visitor UA");
  assert(analyticsCalls[0].body.payload.ip === "203.0.113.42", "full visitor IP");
  assert(analyticsCalls[0].body.payload.language === "fr-CA", "first language only");
});

await run("uses scheduled target during active time window", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(
    request("/hangout"),
    env({
      V8S_NOW: "2026-05-11T14:00:00Z"
    }),
    ctx
  );
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
  const response = await worker.fetch(
    request("/hangout"),
    env({
      V8S_NOW: "2026-05-11T23:00:00Z"
    }),
    ctx
  );
  await ctx.flush();
  assert(response.status === 302, "status");
  assert(response.headers.get("location") === "https://discord.gg/personal", "location");
  assert(analyticsCalls.length === 1, "analytics count");
  assert(analyticsCalls[0].body.payload.data.schedule_label === "", "schedule label");
  assert(analyticsCalls[0].body.payload.data.target_host === "discord.gg", "target host");
});

await run("supports schedule windows that cross midnight", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    tree: createRegistryTree([
      {
        slug: "overnight",
        target: "https://example.com/day",
        state: "permanent",
        schedule: {
          rules: [
            {
              label: "night",
              timezone: "UTC",
              days: ["mon"],
              from: "22:00",
              to: "02:00",
              target: "https://example.com/night"
            }
          ]
        }
      }
    ])
  });

  try {
    const active = await worker.fetch(request("/overnight"), env({ V8S_NOW: "2026-06-02T01:00:00Z" }), mockCtx());
    assert(active.headers.get("location") === "https://example.com/night", "after midnight active");

    const inactive = await worker.fetch(request("/overnight"), env({ V8S_NOW: "2026-06-02T03:00:00Z" }), mockCtx());
    assert(inactive.headers.get("location") === "https://example.com/day", "after window inactive");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
});

await run("falls back to default target for invalid schedule rules", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    tree: createRegistryTree([
      {
        slug: "bad-schedule",
        target: "https://example.com/default",
        state: "permanent",
        schedule: {
          rules: [
            {
              label: "bad timezone",
              timezone: "Not/AZone",
              days: ["mon"],
              from: "09:00",
              to: "17:00",
              target: "https://example.com/scheduled"
            }
          ]
        }
      }
    ])
  });

  try {
    const response = await worker.fetch(request("/bad-schedule"), env({ V8S_NOW: "2026-06-01T14:00:00Z" }), mockCtx());
    assert(response.status === 302, "status");
    assert(response.headers.get("location") === "https://example.com/default", "default target");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
});

await run("uses the first matching schedule rule", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    tree: createRegistryTree([
      {
        slug: "priority",
        target: "https://example.com/default",
        state: "permanent",
        schedule: {
          rules: [
            {
              label: "first",
              timezone: "UTC",
              days: ["mon"],
              from: "09:00",
              to: "17:00",
              target: "https://example.com/first"
            },
            {
              label: "second",
              timezone: "UTC",
              days: ["mon"],
              from: "09:00",
              to: "17:00",
              target: "https://example.com/second"
            }
          ]
        }
      }
    ])
  });

  try {
    const ctx = mockCtx();
    const response = await worker.fetch(request("/priority"), env({ V8S_NOW: "2026-06-01T14:00:00Z" }), ctx);
    await ctx.flush();
    assert(response.headers.get("location") === "https://example.com/first", "first target");
    assert(analyticsCalls[0].body.payload.data.schedule_label === "first", "first label");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
});

await run("refuses unsafe registry redirect targets at runtime", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    tree: createRegistryTree([
      {
        slug: "bad",
        target: "javascript:alert(1)",
        state: "permanent"
      }
    ])
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
  await worker.fetch(
    request("/test", {
      headers: {
        "accept-language": "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz,en;q=0.9"
      }
    }),
    env(),
    ctx
  );
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
  await worker.fetch(
    request("/test", {
      headers: {
        "user-agent": "curl/8.0.0"
      }
    }),
    env(),
    ctx
  );
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
  await worker.fetch(
    request("/missing", {
      headers: {
        "user-agent": "Googlebot/2.1"
      }
    }),
    env({ UMAMI_BOT_MODE: "original" }),
    ctx
  );
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

await run("keeps redirects available when analytics delivery fails", async () => {
  const previousFetch = globalThis.fetch;
  const ctx = mockCtx();

  globalThis.fetch = async () => {
    throw new Error("simulated analytics outage");
  };

  try {
    const response = await worker.fetch(request("/test"), env(), ctx);
    assert(response.status === 302, "redirect status");
    assert(response.headers.get("location") === "https://example.com/test", "location");
    await ctx.flush();
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await run("tracks Fathom events when configured as provider", async () => {
  const ctx = mockCtx();
  await worker.fetch(
    request("/test"),
    env({
      ANALYTICS_PROVIDER: "fathom",
      FATHOM_SITE_ID: "ABCDEFG"
    }),
    ctx
  );
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
  await worker.fetch(
    request("/test"),
    env({
      ANALYTICS_PROVIDER: "umami,fathom",
      FATHOM_SITE_ID: "ABCDEFG"
    }),
    ctx
  );
  await ctx.flush();
  assert(analyticsCalls.length === 2, "analytics count");
  assert(analyticsCalls[0].url === "https://cloud.umami.is/api/send", "umami endpoint");
  assert(
    new URL(analyticsCalls[1].url).origin + new URL(analyticsCalls[1].url).pathname === "https://cdn.usefathom.com/",
    "fathom endpoint"
  );
});

await run("supports Fathom endpoint overrides", async () => {
  const ctx = mockCtx();
  await worker.fetch(
    request("/privacy"),
    env({
      ANALYTICS_PROVIDER: "fathom",
      FATHOM_SITE_ID: "ABCDEFG",
      FATHOM_ENDPOINT: "https://stats.example.com"
    }),
    ctx
  );
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

await run("prefers registry tree when present", async () => {
  const originalRegistryResponse = assets["/v8s.json"];
  assets["/v8s.json"] = Response.json({
    ...registry,
    tree: {
      children: {
        test: {
          children: {},
          link: {
            slug: "test",
            match: "exact",
            target: "https://tree.example/test",
            state: "permanent"
          }
        }
      }
    }
  });

  try {
    const ctx = mockCtx();
    const response = await worker.fetch(request("/test"), env(), ctx);
    await ctx.flush();
    assert(response.status === 302, "status");
    assert(response.headers.get("location") === "https://tree.example/test", "tree location");
  } finally {
    assets["/v8s.json"] = originalRegistryResponse;
  }
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
    assertSecurityHeaders(response);
  }
  assert(analyticsCalls.length === 4, "state pageview count");
  assert(
    analyticsCalls.every((call) => !("name" in call.body.payload)),
    "state pages are pageviews"
  );
});

await run("renders custom 404 for missed short links and tracks miss", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/missing"), env(), ctx);
  await ctx.flush();
  const body = await response.text();
  assert(response.status === 404, "status");
  assertSecurityHeaders(response);
  assert(body.includes("missing"), "slug message");
  assert(response.headers.get("x-correlation-id"), "correlation header");
  assert(analyticsCalls.length === 2, "analytics count");
  assert(analyticsCalls[0].body.payload.name === "short-link-miss", "event name");
  assert(!("name" in analyticsCalls[1].body.payload), "404 pageview");
});

await run("escapes custom 404 slug content", async () => {
  const response = await worker.fetch(request("/%3Cscript%3Ealert(1)%3C%2Fscript%3E"), env(), mockCtx());
  const body = await response.text();
  assert(response.status === 404, "status");
  assert(!body.includes("<script>alert(1)</script>"), "raw script tag is not rendered");
  assert(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "escaped script tag is rendered");
});

await run("passes static file extensions to assets", async () => {
  const ctx = mockCtx();
  const response = await worker.fetch(request("/v8s-style.css"), env(), ctx);
  assert(response.status === 200, "status");
  assert(response.headers.get("content-type") === "text/css", "content type");
});

async function generateAccessKey(kid) {
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
    kid,
    privateKey: keyPair.privateKey,
    jwk: {
      ...publicJwk,
      kid,
      alg: "RS256",
      use: "sig"
    }
  };
}

async function signAccessJwtWithKey(key, { teamDomain, aud, kid }) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    kid: kid || key.kid,
    typ: "JWT"
  };
  const payload = {
    aud: [aud],
    email: "ops@example.com",
    exp: now + 300,
    iat: now,
    iss: `https://${teamDomain}`,
    sub: "user-id"
  };
  const input = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(input));

  return `${input}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function jwksResponse(keys) {
  return Response.json({ keys: keys.map((key) => key.jwk) });
}

function accessFetchEnv(teamDomain, aud, overrides = {}) {
  return env({
    CF_ACCESS_TEAM_DOMAIN: teamDomain,
    CF_ACCESS_AUD: aud,
    ...overrides
  });
}

function statsApiRequest(token) {
  return request("/en/_stats/api/v8s.json", {
    headers: {
      "cf-access-jwt-assertion": token
    }
  });
}

async function withCertsFetch(teamDomain, handler, fn) {
  const previousFetch = globalThis.fetch;
  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
  const state = { certCalls: 0 };

  globalThis.fetch = async (url, init) => {
    const target = typeof url === "string" ? url : url.url;
    if (target === certsUrl) {
      state.certCalls += 1;
      return handler(state.certCalls);
    }
    return previousFetch(url, init);
  };

  try {
    return await fn(state);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

await run("fetches Access keyset once and serves later requests from cache", async () => {
  const teamDomain = "cache-hit.cloudflareaccess.test";
  const aud = "cache-hit-aud";
  const signingKey = await generateAccessKey("kid-cache");

  await withCertsFetch(
    teamDomain,
    () => jwksResponse([signingKey]),
    async (state) => {
      const accessEnv = accessFetchEnv(teamDomain, aud);
      const token = await signAccessJwtWithKey(signingKey, { teamDomain, aud });

      const first = await worker.fetch(statsApiRequest(token), accessEnv, mockCtx());
      const second = await worker.fetch(statsApiRequest(token), accessEnv, mockCtx());

      assert(first.status === 200, "first request authorized");
      assert(second.status === 200, "second request authorized");
      assert(state.certCalls === 1, "certs endpoint fetched exactly once");
    }
  );
});

await run("does not cache a failed keyset fetch and recovers on retry", async () => {
  const teamDomain = "transient.cloudflareaccess.test";
  const aud = "transient-aud";
  const signingKey = await generateAccessKey("kid-transient");

  await withCertsFetch(
    teamDomain,
    (callNumber) => {
      if (callNumber === 1) throw new Error("simulated transient certs failure");
      return jwksResponse([signingKey]);
    },
    async (state) => {
      const accessEnv = accessFetchEnv(teamDomain, aud);
      const token = await signAccessJwtWithKey(signingKey, { teamDomain, aud });

      const failed = await worker.fetch(statsApiRequest(token), accessEnv, mockCtx());
      const recovered = await worker.fetch(statsApiRequest(token), accessEnv, mockCtx());

      assert(failed.status === 403, "first request fails closed when certs are unavailable");
      assert(recovered.status === 200, "retry succeeds because the failure was not cached");
      assert(state.certCalls === 2, "certs endpoint retried rather than caching the rejection");
    }
  );
});

await run("refreshes the keyset once when a token kid is unknown", async () => {
  const teamDomain = "rotation.cloudflareaccess.test";
  const aud = "rotation-aud";
  const oldKey = await generateAccessKey("kid-old");
  const newKey = await generateAccessKey("kid-new");

  await withCertsFetch(
    teamDomain,
    (callNumber) => (callNumber === 1 ? jwksResponse([oldKey]) : jwksResponse([oldKey, newKey])),
    async (state) => {
      const accessEnv = accessFetchEnv(teamDomain, aud, {
        V8S_JWKS_MIN_REFRESH_MS: "0"
      });
      const oldToken = await signAccessJwtWithKey(oldKey, { teamDomain, aud });
      const primed = await worker.fetch(statsApiRequest(oldToken), accessEnv, mockCtx());
      assert(primed.status === 200, "token signed by the original key is authorized");
      assert(state.certCalls === 1, "keyset fetched once to prime the cache");

      const newToken = await signAccessJwtWithKey(newKey, { teamDomain, aud });
      const rotated = await worker.fetch(statsApiRequest(newToken), accessEnv, mockCtx());

      assert(rotated.status === 200, "token signed by the rotated key is authorized after refresh");
      assert(state.certCalls === 2, "unknown kid triggered exactly one refresh");
    }
  );
});

await run("throttles repeated unknown-kid refresh attempts", async () => {
  const teamDomain = "throttle.cloudflareaccess.test";
  const aud = "throttle-aud";
  const signingKey = await generateAccessKey("kid-known");

  await withCertsFetch(
    teamDomain,
    () => jwksResponse([signingKey]),
    async (state) => {
      const accessEnv = accessFetchEnv(teamDomain, aud);
      const validToken = await signAccessJwtWithKey(signingKey, { teamDomain, aud });
      const primed = await worker.fetch(statsApiRequest(validToken), accessEnv, mockCtx());
      assert(primed.status === 200, "valid token primes the cache");
      assert(state.certCalls === 1, "keyset fetched once to prime the cache");

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ghostToken = await signAccessJwtWithKey(signingKey, { teamDomain, aud, kid: "ghost" });
        const rejected = await worker.fetch(statsApiRequest(ghostToken), accessEnv, mockCtx());
        assert(rejected.status === 403, "unknown kid is rejected");
      }

      assert(state.certCalls === 1, "throttle suppressed repeated unknown-kid refetches");
    }
  );
});

globalThis.fetch = originalFetch;
