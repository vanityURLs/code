import { readFile } from "node:fs/promises";
import path from "node:path";
import worker from "./workers/worker.mjs";

const ROOT = new URL("..", import.meta.url);
const BUILD_DIR = new URL("../build", import.meta.url);
const DEFAULT_HOST = "https://dicai.re";
const DEMO_UMAMI_ID = "00000000-0000-0000-0000-000000000000";

const analyticsCalls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  analyticsCalls.push({
    url: String(url),
    method: init.method || "GET",
    headers: redactHeaders(init.headers || {}),
    body: parseJson(init.body)
  });

  return new Response("ok", { status: 200 });
};

const vars = {
  ...(await wranglerVars()),
  ...envOverrides()
};

if (providerEnabled(vars, "umami") && !vars.UMAMI_WEBSITE_ID) {
  vars.UMAMI_WEBSITE_ID = DEMO_UMAMI_ID;
}

const registry = await readJsonAsset("/v8s.json");
const paths = process.argv.slice(2);
const firstLink = registry.links?.find((link) => link.slug)?.slug || "gh";
const scenarios = paths.length
  ? paths.map((pathname) => ({ method: "GET", pathname }))
  : [
      { method: "GET", pathname: "/" },
      { method: "GET", pathname: `/${firstLink}` },
      { method: "GET", pathname: "/not-a-real-short-link" },
      { method: "GET", pathname: "/lookup" },
      {
        method: "POST",
        pathname: "/_analytics/lookup",
        body: {
          slug: firstLink,
          result: "resolved",
          state: "permanent",
          target: "https://example.com"
        }
      }
    ];

const results = [];

for (const scenario of scenarios) {
  const before = analyticsCalls.length;
  const ctx = mockCtx();
  const response = await worker.fetch(requestFor(scenario), env(vars), ctx);
  await ctx.flush();

  results.push({
    request: `${scenario.method} ${scenario.pathname}`,
    response: response.status,
    analytics: analyticsCalls.slice(before)
  });
}

globalThis.fetch = originalFetch;

console.log(
  JSON.stringify(
    {
      provider: vars.ANALYTICS_PROVIDER || "",
      note: "Dry run only: analytics requests were intercepted and not sent.",
      results
    },
    null,
    2
  )
);

function env(vars) {
  return {
    ...vars,
    ASSETS: {
      fetch: async (request) => {
        const assetPath = new URL(request.url).pathname;
        return fetchAsset(assetPath);
      }
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

function requestFor(scenario) {
  const headers = {
    "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
    "cf-connecting-ip": "203.0.113.42",
    referer: "https://example.com/source",
    "user-agent": "Mozilla/5.0 analytics-smoke"
  };

  const init = { method: scenario.method, headers };

  if (scenario.body) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(scenario.body);
  }

  return new Request(new URL(scenario.pathname, DEFAULT_HOST), init);
}

async function fetchAsset(assetPath) {
  const normalized = assetPath === "/" ? "/index.html" : assetPath;
  const filePath = path.join(BUILD_DIR.pathname, decodeURIComponent(normalized));

  try {
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        "content-type": contentType(filePath)
      }
    });
  } catch {
    const fallback = path.join(BUILD_DIR.pathname, "404.html");

    try {
      return new Response(await readFile(fallback), {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    } catch {
      return new Response("asset not found", { status: 404 });
    }
  }
}

async function readJsonAsset(assetPath) {
  const response = await fetchAsset(assetPath);
  return response.json();
}

async function wranglerVars() {
  const config = await readFile(new URL("wrangler.toml", ROOT), "utf8");
  const vars = {};
  let inVars = false;

  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      inVars = line === "[vars]";
      continue;
    }

    if (!inVars) continue;

    const match = line.match(/^([A-Z0-9_]+)\s*=\s*['"]([^'"]*)['"]$/);
    if (match) {
      vars[match[1]] = match[2];
    }
  }

  return vars;
}

function envOverrides() {
  const names = [
    "ANALYTICS_PROVIDER",
    "UMAMI_ENDPOINT",
    "UMAMI_WEBSITE_ID",
    "UMAMI_GEO_IP_MODE",
    "UMAMI_BOT_MODE",
    "FATHOM_SITE_ID",
    "FATHOM_ENDPOINT",
    "FATHOM_API_TOKEN",
    "FATHOM_BOT_MODE"
  ];

  return Object.fromEntries(names.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
}

function providerEnabled(vars, provider) {
  return String(vars.ANALYTICS_PROVIDER || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes(provider);
}

function parseJson(body) {
  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return String(body);
  }
}

function redactHeaders(headers) {
  const result = {};

  for (const [name, value] of Object.entries(headers)) {
    result[name] = name.toLowerCase() === "authorization" ? "Bearer <redacted>" : value;
  }

  return result;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
