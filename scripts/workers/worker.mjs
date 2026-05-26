const ASSET_EXT_RE =
  /\.(html|css|js|mjs|map|json|png|svg|ico|webmanifest|txt|xml|woff2?|ttf|otf|eot)$/i;

const WORKER_UA_FALLBACK =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const SAFE_REDIRECT_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_ALIASES = {
  sun: "sun",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat"
};

let runtimeBlocklistPromise;
const accessJwksPromises = new Map();

const LOCALIZED_HTML_LANGUAGES = ["fr", "es", "it", "de"]; // build replaces this list from v8s-site-config.json

const BOT_PATTERNS = [
  { re: /googlebot/i, name: "Googlebot" },
  { re: /bingbot/i, name: "Bingbot" },
  { re: /duckduckbot|duckduckgo-favicons-bot/i, name: "DuckDuckBot" },
  { re: /yandexbot/i, name: "YandexBot" },
  { re: /baiduspider/i, name: "Baiduspider" },
  { re: /applebot/i, name: "Applebot" },
  { re: /ahrefsbot/i, name: "AhrefsBot" },
  { re: /semrushbot/i, name: "SemrushBot" },
  { re: /mj12bot/i, name: "MJ12bot" },
  { re: /dotbot/i, name: "DotBot" },
  { re: /gptbot/i, name: "GPTBot" },
  { re: /claudebot|claude-web/i, name: "ClaudeBot" },
  { re: /perplexitybot/i, name: "PerplexityBot" },
  { re: /ccbot/i, name: "CCBot" },
  { re: /bytespider/i, name: "Bytespider" },
  { re: /facebookexternalhit/i, name: "FacebookExternalHit" },
  { re: /twitterbot/i, name: "Twitterbot" },
  { re: /linkedinbot/i, name: "LinkedInBot" },
  { re: /slackbot/i, name: "Slackbot" },
  { re: /discordbot/i, name: "Discordbot" },
  { re: /telegrambot/i, name: "TelegramBot" },
  { re: /whatsapp/i, name: "WhatsApp" },
  { re: /uptimerobot|pingdom|monitis|statuscake/i, name: "Monitor" },
  { re: /curl|wget|python-requests|libwww/i, name: "CLI" },
  { re: /bot[\/\s\-\d]|crawler|spider|scraper/i, name: "Other" },
  { re: /headlesschrome|phantomjs|httrack/i, name: "Headless" }
];

export default {
  async fetch(request, env, ctx) {
    return handleRequest({ request, env, ctx });
  }
};

async function handleRequest(context) {
  const { request, env, ctx } = context;
  const url = new URL(request.url);
  const slug = normalizeSlug(url.pathname);
  const correlationId = crypto.randomUUID();

  if (slug === "_analytics/expand") {
    return handleExpandAnalytics(request, env, ctx, correlationId);
  }

  if (isProtectedPath(slug)) {
    const accessResponse = await requireCloudflareAccess(request, env);
    if (accessResponse) return accessResponse;
  }

  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowedResponse();
  }

  if (slug === "_stats/api/v8s.json") {
    return renderStatsRegistry(request, env);
  }

  if (slug === "_stats/api/redirects") {
    return renderStatsRedirects(request, env);
  }

  if (isTestsPath(slug)) {
    return renderTestsPage(request, env, ctx);
  }

  const scannerProbe = await findScannerProbe(request, env);

  if (scannerProbe) {
    return renderScannerProbe404(scannerProbe);
  }

  if (slug === "expand") {
    return renderAsset(request, env, "/expand/index.html", 200, ctx);
  }

  if (slug === "") {
    return renderAsset(request, env, "/index.html", 200, ctx);
  }

  if (shouldBypassToAssets(slug)) {
    const response = await fetchLocalizedAsset(request, env, `/${slug}`);
    ctx.waitUntil?.(trackPageview(env, request, response));
    return response;
  }

  if (isPrivateRuntimeAsset(slug)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  if (slug === "expired") {
    return renderStatePage(request, env, "expired", ctx);
  }

  if (slug === "disabled") {
    return renderStatePage(request, env, "disabled", ctx);
  }

  if (slug === "maintenance") {
    return renderStatePage(request, env, "maintenance", ctx);
  }

  if (hasStaticPageAlias(slug)) {
    return renderAsset(request, env, staticPageAliasPath(slug), 200, ctx);
  }

  if (slug === "deactivated") {
    return render404(request, env, {
      slug: "",
      correlationId
    });
  }

  if (slug === "404") {
    return render404(request, env, {
      slug: "",
      correlationId
    });
  }

  let registry;

  try {
    registry = await loadRegistry(request, env);
  } catch {
    return new Response("Registry load failed", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-correlation-id": correlationId
      }
    });
  }

  const resolved = resolveLink(registry.links || [], slug);

  if (!resolved) {
    ctx.waitUntil?.(
      logAnalyticsEvent(env, request, {
        event: "short-link-miss",
        slug,
        correlation_id: correlationId
      })
    );

    return render404(request, env, {
      slug,
      correlationId
    });
  }

  const { link, splat } = resolved;
  const effectiveState = getEffectiveState(link, registry);
  const route = registry.routing?.[effectiveState];

  if (!route) {
    return render404(request, env, {
      slug,
      correlationId
    });
  }

  if (route.type === "error") {
    ctx.waitUntil?.(
      logAnalyticsEvent(env, request, {
        event: "short-link-miss",
        slug,
        correlation_id: correlationId,
        effective_state: effectiveState
      })
    );

    if (hasStatePage(effectiveState)) {
      return renderStatePage(request, env, effectiveState, ctx);
    }

    return render404(request, env, {
      slug,
      correlationId
    });
  }

  if (route.type !== "redirect") {
    return render404(request, env, {
      slug,
      correlationId
    });
  }

  const resolvedTarget = resolveTarget(route, link, request, splat, env);
  const { target, scheduleLabel } = resolvedTarget;

  if (!target) {
    ctx.waitUntil?.(
      logAnalyticsEvent(env, request, {
        event: "short-link-miss",
        slug,
        correlation_id: correlationId,
        effective_state: effectiveState,
        redirect_error: "unsafe-target"
      })
    );

    return render404(request, env, {
      slug,
      correlationId
    });
  }

  const status = safeRedirectStatus(route.status);

  ctx.waitUntil?.(
    logAnalyticsEvent(env, request, {
      event: "redirect",
      slug,
      correlation_id: correlationId,
      target_host: safeHostname(target),
      effective_state: effectiveState,
      schedule_label: scheduleLabel,
      status
    })
  );

  return Response.redirect(target, status);
}

function normalizeSlug(pathname) {
  return decodeURIComponentSafe(pathname)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function shouldBypassToAssets(slug) {
  if (slug === "") return true;

  if (slug === "_stats" || slug.startsWith("_stats/")) return true;
  if (slug === "expand" || slug.startsWith("expand/")) return true;

  if (isPrivateRuntimeAsset(slug)) return false;

  return ASSET_EXT_RE.test(slug);
}

function isProtectedPath(slug) {
  return slug === "_stats" || slug.startsWith("_stats/") || isTestsPath(slug);
}

function isTestsPath(slug) {
  return slug === "_tests" || slug.startsWith("_tests/");
}

function isPrivateRuntimeAsset(slug) {
  return slug === "v8s.json" || slug === "v8s-blocklist.json" || slug === "v8s-site-config.json";
}

async function loadRegistry(request, env) {
  const response = await fetchAsset(request, env, "/v8s.json");

  if (!response.ok) {
    throw new Error(`Unable to load registry: ${response.status}`);
  }

  return response.json();
}

async function findScannerProbe(request, env) {
  const policy = await loadRuntimeBlocklist(request, env);
  const keywords = scannerKeywords(policy);
  if (!keywords.length) return null;

  const requestUrl = new URL(request.url);
  const haystack = normalizeKeyword(`${decodeURIComponentSafe(requestUrl.pathname)}${requestUrl.search}`);

  return keywords.find((entry) => haystack.includes(entry.keyword)) || null;
}

async function loadRuntimeBlocklist(request, env) {
  runtimeBlocklistPromise ||= (async () => {
    const response = await fetchAsset(request, env, "/v8s-blocklist.json");
    if (!response.ok) return {};
    return response.json();
  })();

  try {
    return await runtimeBlocklistPromise;
  } catch {
    runtimeBlocklistPromise = null;
    return {};
  }
}

function scannerKeywords(policy) {
  const entries = Array.isArray(policy.blocked_keywords) ? policy.blocked_keywords : [];

  return entries
    .map((entry) => normalizeRuntimeKeyword(entry))
    .filter((entry) => {
      return keywordAppliesToRequest(entry)
        && entry.keyword
        && (entry.category === "scanner-probe" || entry.source === "runtime-scanner-policy");
    });
}

function keywordAppliesToRequest(entry) {
  const scope = String(entry.scope || "request").trim().toLowerCase();
  return scope === "request" || scope === "both" || scope === "all";
}

function normalizeRuntimeKeyword(entry) {
  if (typeof entry === "string") {
    return {
      keyword: normalizeKeyword(entry),
      category: "custom",
      source: ""
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      keyword: "",
      category: "",
      source: ""
    };
  }

  return {
    ...entry,
    keyword: normalizeKeyword(entry.keyword),
    category: String(entry.category || ""),
    source: String(entry.source || ""),
    scope: String(entry.scope || "")
  };
}

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveLink(links, slug) {
  const exact = links.find((link) => {
    return (link.match || "exact") === "exact" && link.slug === slug;
  });

  if (exact) {
    return {
      link: exact,
      splat: ""
    };
  }

  const splats = links
    .filter((link) => link.match === "splat")
    .sort((a, b) => b.slug.length - a.slug.length);

  for (const link of splats) {
    if (slug.startsWith(`${link.slug}/`)) {
      return {
        link,
        splat: slug.slice(link.slug.length + 1)
      };
    }
  }

  return null;
}

function getEffectiveState(link, registry) {
  if (link.expires_at) {
    const expiry = new Date(link.expires_at);
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      return "expired";
    }
  }

  return link.state || registry.default_state || "permanent";
}

function resolveTarget(route, link, request, splat, env) {
  if (!route || typeof route !== "object") {
    return {
      target: "",
      scheduleLabel: ""
    };
  }

  let target;
  let scheduleLabel = "";
  const routeTarget = String(route.target || "");

  if (routeTarget === "link.target") {
    const scheduled = resolveScheduledTarget(link, env);
    target = scheduled.target || link.target;
    scheduleLabel = scheduled.label;
  } else if (isSafeRouteTarget(routeTarget)) {
    target = new URL(routeTarget, request.url).toString();
  } else {
    return {
      target: "",
      scheduleLabel: ""
    };
  }

  if (splat) {
    target = target.replaceAll(":splat", encodeSplat(splat));
  }

  return {
    target: sanitizeRedirectTarget(target, request),
    scheduleLabel
  };
}

function resolveScheduledTarget(link, env) {
  const rules = link?.schedule?.rules;

  if (!Array.isArray(rules) || !rules.length) {
    return {
      target: "",
      label: ""
    };
  }

  const date = scheduledDate(env);

  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || !rule.target) continue;

    if (isScheduleRuleActive(rule, date)) {
      return {
        target: rule.target,
        label: String(rule.label || "")
      };
    }
  }

  return {
    target: "",
    label: ""
  };
}

function scheduledDate(env) {
  if (env?.V8S_NOW) {
    const date = new Date(env.V8S_NOW);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return new Date();
}

function isScheduleRuleActive(rule, date) {
  const parts = scheduleParts(rule.timezone || "UTC", date);
  if (!parts) return false;

  const from = timeToMinutes(rule.from);
  const to = timeToMinutes(rule.to);

  if (from === null || to === null) return false;

  const days = new Set(Array.isArray(rule.days) ? rule.days : []);
  if (!days.size) return false;

  if (from <= to) {
    return days.has(parts.day) && parts.minute >= from && parts.minute < to;
  }

  return (
    (days.has(parts.day) && parts.minute >= from) ||
    (days.has(previousWeekday(parts.day)) && parts.minute < to)
  );
}

function scheduleParts(timezone, date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const day = WEEKDAY_ALIASES[String(values.weekday || "").toLowerCase()];
    const hour = Number(values.hour);
    const minute = Number(values.minute);

    if (!day || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;

    return {
      day,
      minute: hour * 60 + minute
    };
  } catch {
    return null;
  }
}

function previousWeekday(day) {
  const index = WEEKDAYS.indexOf(day);
  if (index < 0) return "";
  return WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length];
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function safeRedirectStatus(value) {
  const status = Number(value);
  return SAFE_REDIRECT_STATUSES.has(status) ? status : 302;
}

function isSafeRouteTarget(value) {
  if (!value || hasControlChars(value)) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.startsWith("/")) return true;
  return /^https?:\/\//i.test(value);
}

function sanitizeRedirectTarget(value, request) {
  if (!value || hasControlChars(value)) return "";

  let target;

  try {
    target = new URL(value, request.url);
  } catch {
    return "";
  }

  if (!SAFE_REDIRECT_PROTOCOLS.has(target.protocol)) return "";
  if (!target.hostname) return "";
  if (target.username || target.password) return "";

  return target.toString();
}

function encodeSplat(value) {
  return String(value || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hasControlChars(value) {
  return /[\u0000-\u001F\u007F]/.test(String(value || ""));
}

const statePages = {
  disabled: {
    assetPath: "/disabled.html",
    status: 403
  },
  expired: {
    assetPath: "/expired.html",
    status: 410
  },
  maintenance: {
    assetPath: "/maintenance.html",
    status: 503
  }
};

const staticPageAliases = new Map([
  ["abuse", "/abuse.html"],
  ["index", "/index.html"],
  ["privacy", "/privacy.html"],
  ["security", "/security.html"],
  ["terms", "/terms.html"],
  ["trust-safety", "/abuse.html"]
]);

function hasStatePage(state) {
  return Object.hasOwn(statePages, state);
}

function hasStaticPageAlias(slug) {
  return staticPageAliases.has(slug);
}

function staticPageAliasPath(slug) {
  return staticPageAliases.get(slug);
}

async function renderStatePage(request, env, state, ctx) {
  const page = statePages[state];

  if (!page) {
    return render404(request, env, {
      slug: state,
      correlationId: crypto.randomUUID()
    });
  }

  return renderAsset(request, env, page.assetPath, page.status, ctx);
}

async function renderAsset(request, env, assetPath, status = 200, ctx) {
  const response = await fetchLocalizedAsset(request, env, assetPath);
  const headers = new Headers(response.headers);

  const pageResponse = new Response(response.body, {
    status,
    headers
  });

  ctx?.waitUntil?.(trackPageview(env, request, pageResponse.clone()));

  return pageResponse;
}

async function trackPageview(env, request, response) {
  if (request.method !== "GET") return;
  if (!shouldTrackPageviewResponse(response)) return;

  await logAnalyticsEvent(env, request, {
    event: "pageview",
    status: response.status
  });
}

function shouldTrackPageviewResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().startsWith("text/html");
}

async function fetchAsset(request, env, assetPath) {
  const assetUrl = new URL(assetPath, request.url);

  const assetRequest = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  return env.ASSETS.fetch(assetRequest);
}

async function fetchLocalizedAsset(request, env, assetPath) {
  if (!isLocalizableHtmlAsset(assetPath)) {
    return fetchAsset(request, env, assetPath);
  }

  for (const language of preferredContentLanguages(request)) {
    const localizedPath = localizeAssetPath(assetPath, language);
    const response = await fetchAsset(request, env, localizedPath);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.append("vary", "Accept-Language");
      headers.set("content-language", language);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }

  return fetchAsset(request, env, assetPath);
}

function isLocalizableHtmlAsset(assetPath) {
  return assetPath === "/index.html" || assetPath.endsWith(".html");
}

function localizeAssetPath(assetPath, language) {
  return `/${language}${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

function preferredContentLanguages(request) {
  const header = request.headers.get("accept-language") || "";

  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim().toLowerCase())
        .find((param) => param.startsWith("q="));
      return {
        language: tag.toLowerCase().split("-")[0],
        quality: quality ? Number.parseFloat(quality.slice(2)) : 1
      };
    })
    .filter((entry) => LOCALIZED_HTML_LANGUAGES.includes(entry.language) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.language);
}

async function render404(request, env, { slug, correlationId }) {
  try {
    const response = await fetchLocalizedAsset(request, env, "/404.html");

    let body = await response.text();

    body = body
      .replaceAll("{{CORRELATION_ID}}", escapeHtml(correlationId))
      .replaceAll("{{SLUG_MESSAGE}}", renderSlugMessage(request, slug))
      .replaceAll("{{REFERENCE_LINE}}", renderReferenceLine(request, correlationId));

    if (!body.includes(correlationId)) {
      body = body.replace("Reference:", `Reference: ${escapeHtml(correlationId)}`);
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("x-correlation-id", correlationId);

    const pageResponse = new Response(body, {
      status: 404,
      headers
    });

    await trackPageview(env, request, pageResponse.clone());

    return pageResponse;
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-correlation-id": correlationId
      }
    });
  }
}

function renderScannerProbe404(match) {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-deny-category": match.category || "scanner-probe"
    }
  });
}

function renderSlugMessage(request, slug) {
  if (!slug) return "";

  return `<p class="slug-note">${escapeHtml(statusLabel(request, "requestedSlug"))}: <code>${escapeHtml(slug)}</code></p>`;
}

function renderReferenceLine(request, correlationId) {
  return `<p class="reference">${escapeHtml(statusLabel(request, "reference"))}: <code>${escapeHtml(correlationId)}</code></p>`;
}

function statusLabel(request, key) {
  const language = preferredContentLanguages(request)[0] || "en";
  const labels = {
    en: {
      requestedSlug: "Requested slug",
      reference: "Reference"
    },
    fr: {
      requestedSlug: "Lien demandé",
      reference: "Référence"
    },
    es: {
      requestedSlug: "Enlace solicitado",
      reference: "Referencia"
    },
    it: {
      requestedSlug: "Link richiesto",
      reference: "Riferimento"
    },
    de: {
      requestedSlug: "Angeforderter Kurzlink",
      reference: "Referenz"
    }
  };

  return labels[language]?.[key] || labels.en[key] || key;
}

async function renderTestsPage(request, env, ctx) {
  return renderAsset(request, env, "/_tests/index.html", 200, ctx);
}

async function requireCloudflareAccess(request, env) {
  const teamDomain = normalizeAccessTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const expectedAud = env.CF_ACCESS_AUD;

  if (!teamDomain || !expectedAud) {
    return protectedPathResponse("Cloudflare Access is not configured", 503);
  }

  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (!token) {
    return protectedPathResponse("Forbidden", 403);
  }

  try {
    const verified = await verifyCloudflareAccessToken(token, teamDomain, expectedAud, env);
    if (verified) return null;
  } catch {
    return protectedPathResponse("Forbidden", 403);
  }

  return protectedPathResponse("Forbidden", 403);
}

function protectedPathResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function methodNotAllowedResponse() {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      "allow": "GET, HEAD, OPTIONS",
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "allow": "GET, HEAD, OPTIONS",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

async function verifyCloudflareAccessToken(token, teamDomain, expectedAud, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = parseJwtPart(parts[0]);
  const payload = parseJwtPart(parts[1]);

  if (header.alg !== "RS256" || !header.kid) return false;
  if (payload.iss !== `https://${teamDomain}`) return false;
  if (!audienceIncludes(payload.aud, expectedAud)) return false;
  if (!isJwtTimeValid(payload)) return false;

  const jwks = await loadAccessJwks(teamDomain, env);
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
}

async function loadAccessJwks(teamDomain, env) {
  if (env.CF_ACCESS_JWKS_JSON) return JSON.parse(env.CF_ACCESS_JWKS_JSON);

  if (!accessJwksPromises.has(teamDomain)) {
    accessJwksPromises.set(teamDomain, fetch(`https://${teamDomain}/cdn-cgi/access/certs`).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load Cloudflare Access certs: ${response.status}`);
      return response.json();
    }));
  }

  return accessJwksPromises.get(teamDomain);
}

function parseJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeAccessTeamDomain(value) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

function audienceIncludes(audience, expectedAud) {
  return Array.isArray(audience) ? audience.includes(expectedAud) : audience === expectedAud;
}

function isJwtTimeValid(payload) {
  const now = Math.floor(Date.now() / 1000);
  const skew = 60;

  if (typeof payload.exp !== "number" || payload.exp <= now - skew) return false;
  if (typeof payload.nbf === "number" && payload.nbf > now + skew) return false;
  if (typeof payload.iat === "number" && payload.iat > now + skew) return false;

  return true;
}

async function renderStatsRegistry(request, env) {
  const response = await fetchAsset(request, env, "/v8s.json");

  if (!response.ok) {
    return new Response("Unable to load v8s registry", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("content-disposition", 'attachment; filename="v8s.json"');
  headers.set("x-robots-tag", "noindex, nofollow");

  return new Response(response.body, {
    status: 200,
    headers
  });
}

async function renderStatsRedirects(request, env) {
  const response = await fetchAsset(request, env, "/v8s.json");

  if (!response.ok) {
    return new Response("Unable to load redirect data", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  const data = await response.json();

  const staticEntries = Object.entries(data.static || {}).map(([source, value]) => ({
    type: "static",
    source,
    target: value.target,
    status: value.status,
    description: value.description || ""
  }));

  const dynamicEntries = (data.dynamic || []).map((value) => ({
    type: "dynamic",
    source: value.source,
    target: value.target,
    status: value.status,
    description: value.description || ""
  }));

  const linkEntries = (data.links || []).map((link) => ({
    type: link.match === "splat" ? "dynamic" : "static",
    source: `/${link.slug}`,
    target: link.target,
    schedule_rules: Array.isArray(link.schedule?.rules) ? link.schedule.rules.length : 0,
    status: data.routing?.[link.state || data.default_state || "permanent"]?.status || 302,
    description: link.description || ""
  }));

  const all = [...staticEntries, ...dynamicEntries, ...linkEntries];
  const duplicatesMap = {};

  for (const redirect of all) {
    if (!redirect.target) continue;
    duplicatesMap[redirect.target] ||= [];
    duplicatesMap[redirect.target].push(redirect.source);
  }

  const duplicates = Object.entries(duplicatesMap)
    .filter(([, sources]) => sources.length > 1)
    .map(([target, sources]) => ({ target, sources }));

  const missingDescriptions = all.filter((redirect) => !redirect.description);
  const dynamicRoutes = all.filter((redirect) => redirect.type === "dynamic");
  const reservedPrefixes = ["/_stats", "/api", "/_worker", "/v8s.json", "/v8s-blocklist.json", "/v8s-site-config.json"];
  const reservedViolations = all.filter((redirect) => {
    return reservedPrefixes.some((prefix) => redirect.source.startsWith(prefix));
  });
  const statusCounts = {};

  for (const redirect of all) {
    statusCounts[redirect.status] = (statusCounts[redirect.status] || 0) + 1;
  }

  return Response.json({
    total: all.length,
    static: staticEntries.length + linkEntries.filter((entry) => entry.type === "static").length,
    dynamic: dynamicEntries.length + linkEntries.filter((entry) => entry.type === "dynamic").length,
    statusCounts,
    duplicates: duplicates.slice(0, 20),
    missingDescriptions: missingDescriptions.slice(0, 50),
    reservedViolations,
    dynamicRoutes: dynamicRoutes.slice(0, 50),
    all
  });
}

async function handleExpandAnalytics(request, env, ctx, correlationId) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "allow": "POST",
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const slug = normalizeSlug(`/${String(body.slug || "")}`).slice(0, 99);
  const state = String(body.state || "").slice(0, 40);
  const result = String(body.result || "").slice(0, 40);
  const target = typeof body.target === "string" ? body.target : "";

  ctx.waitUntil?.(
    logAnalyticsEvent(env, request, {
      event: "expand",
      slug,
      correlation_id: correlationId,
      target_host: safeHostname(target),
      effective_state: state,
      expand_result: result
    })
  );

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

async function logAnalyticsEvent(env, request, data) {
  const providers = analyticsProviders(env);
  if (!providers.length) return;

  const event = buildAnalyticsEvent(env, request, data);

  await Promise.all(providers.map((provider) => sendAnalyticsProvider(provider, env, event)));
}

function analyticsProviders(env) {
  return String(env.ANALYTICS_PROVIDER || "")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider) => provider && !["disabled", "none", "off"].includes(provider));
}

function buildAnalyticsEvent(env, request, data) {
  const requestUrl = new URL(request.url);
  const visitorUA = request.headers.get("user-agent") || "";
  const botName = detectBot(visitorUA);
  const isPageview = data.event === "pageview";
  const umamiName = botName && env.UMAMI_BOT_MODE !== "original"
    ? "bot"
    : isPageview
      ? ""
      : data.event;
  const fathomName = botName && env.FATHOM_BOT_MODE !== "original"
    ? "bot"
    : isPageview
      ? "pageview"
      : data.event;

  return {
    data,
    requestUrl,
    visitorUA,
    visitorIP: request.headers.get("cf-connecting-ip") || "",
    botName,
    isPageview,
    umamiName,
    fathomName,
    language: firstLanguage(request.headers.get("accept-language")),
    referrer: request.headers.get("referer") || "",
    country: request.cf?.country || "",
    colo: request.cf?.colo || ""
  };
}

async function sendAnalyticsProvider(provider, env, event) {
  if (provider === "umami") {
    return sendUmamiAnalytics(env, event);
  }

  if (provider === "fathom") {
    return sendFathomAnalytics(env, event);
  }

  console.warn(`analytics provider skipped: unsupported provider "${provider}"`);
}

async function sendUmamiAnalytics(env, event) {
  try {
    if (!env.UMAMI_WEBSITE_ID) {
      console.warn("umami tracking skipped: UMAMI_WEBSITE_ID is not configured");
      return;
    }

    const endpoint = normalizeUmamiEndpoint(env.UMAMI_ENDPOINT || "https://cloud.umami.is/api/send");
    const payload = buildUmamiPayload(env, event);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: analyticsRequestHeaders(event.visitorUA),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`umami tracking failed: ${response.status} ${await response.text()}`);
    }
  } catch {
    console.warn("umami tracking failed");
  }
}

function buildUmamiPayload(env, event) {
  const payload = {
    type: "event",
    payload: {
      website: env.UMAMI_WEBSITE_ID,
      url: event.requestUrl.pathname + event.requestUrl.search,
      hostname: event.requestUrl.hostname,
      language: event.language,
      referrer: event.referrer,
      screen: "unknown"
    }
  };

  if (event.umamiName) {
    payload.payload.name = event.umamiName;
  }

  if (!event.isPageview || event.umamiName) {
    payload.payload.data = analyticsEventData(event);
  }

  if (event.botName && payload.payload.data) {
    payload.payload.data.bot_name = event.botName;
    payload.payload.data.bot_event_type = event.data.event;
  }

  if (event.visitorUA) {
    payload.payload.userAgent = event.visitorUA;
  }

  const visitorIP = resolveUmamiIP(env, event.visitorIP);
  if (visitorIP) {
    payload.payload.ip = visitorIP;
  }

  return payload;
}

async function sendFathomAnalytics(env, event) {
  try {
    if (!env.FATHOM_SITE_ID) {
      console.warn("fathom tracking skipped: FATHOM_SITE_ID is not configured");
      return;
    }

    const endpoint = normalizeFathomEndpoint(env.FATHOM_ENDPOINT || "https://cdn.usefathom.com/");
    const response = await fetch(buildFathomUrl(endpoint, env, event), {
      method: "GET",
      headers: analyticsRequestHeaders(event.visitorUA)
    });

    if (!response.ok) {
      console.warn(`fathom tracking failed: ${response.status} ${truncateLogText(await response.text())}`);
    }
  } catch {
    console.warn("fathom tracking failed");
  }
}

function buildFathomUrl(endpoint, env, event) {
  const url = new URL(endpoint);
  const params = {
    h: event.requestUrl.origin,
    p: event.requestUrl.pathname || "/",
    r: event.referrer,
    sid: env.FATHOM_SITE_ID,
    qs: JSON.stringify(queryParametersForAnalytics(event.requestUrl)),
    cid: String(Math.floor(Math.random() * 100000000) + 1)
  };

  if (!event.isPageview) {
    params.name = event.fathomName;
    params.payload = JSON.stringify(analyticsEventData(event));
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function analyticsEventData(event) {
  return {
    event_type: event.data.event,
    slug: event.data.slug || "",
    correlation_id: event.data.correlation_id || "",
    target_host: event.data.target_host || "",
    effective_state: event.data.effective_state || "",
    schedule_label: event.data.schedule_label || "",
    redirect_error: event.data.redirect_error || "",
    expand_result: event.data.expand_result || "",
    status: String(event.data.status || ""),
    country: event.country,
    colo: event.colo,
    url_path: event.requestUrl.pathname,
    url_query: event.requestUrl.search.replace(/^\?/, ""),
    url_full_path: event.requestUrl.pathname + event.requestUrl.search,
    hostname: event.requestUrl.hostname
  };
}

function analyticsRequestHeaders(visitorUA) {
  return {
    "content-type": "application/json",
    "user-agent": shouldUseFallbackUserAgent(visitorUA) ? WORKER_UA_FALLBACK : visitorUA
  };
}

function normalizeUmamiEndpoint(value) {
  const url = new URL(value);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api/send";
  }

  return url.toString();
}

function normalizeFathomEndpoint(value) {
  const url = new URL(value);

  if (url.pathname === "") url.pathname = "/";
  return url.toString();
}

function queryParametersForAnalytics(url) {
  const allowed = new Set([
    "keyword",
    "q",
    "ref",
    "s",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
    "action",
    "name",
    "pagename",
    "tab",
    "via",
    "gclid",
    "msclkid"
  ]);
  const result = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (allowed.has(key)) result[key] = value;
  }

  return result;
}

function truncateLogText(value) {
  return String(value).slice(0, 500);
}

function firstLanguage(header) {
  if (!header) return "";
  const first = header.split(",")[0] || "";
  return first.split(";")[0].trim().slice(0, 35);
}

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function shouldUseFallbackUserAgent(userAgent) {
  return Boolean(detectBot(userAgent));
}

function detectBot(userAgent) {
  if (!userAgent) return "Unknown";

  for (const { re, name } of BOT_PATTERNS) {
    if (re.test(userAgent)) return name;
  }

  return null;
}

function resolveUmamiIP(env, ip) {
  if (!ip) return null;

  if (env.UMAMI_GEO_IP_MODE === "full") {
    return ip;
  }

  if (env.UMAMI_GEO_IP_MODE === "none") {
    return null;
  }

  return truncateIP(ip);
}

function truncateIP(ip) {
  if (!ip) return null;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    const firstThree = parts.slice(0, 3).map((part) => part || "0");
    while (firstThree.length < 3) firstThree.push("0");
    return `${firstThree.join(":")}::`;
  }

  return null;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
