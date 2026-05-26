export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = normalizeSlug(url.pathname);
  const correlationId = crypto.randomUUID();

  if (shouldBypassToAssets(slug)) {
    return context.next();
  }

  if (slug === "v8s.json" || slug === "v8s-blocklist.json" || slug === "v8s-site-config.json") {
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
    return renderStatePage(request, env, "expired");
  }

  if (slug === "disabled") {
    return renderStatePage(request, env, "disabled");
  }

  if (slug === "maintenance") {
    return renderStatePage(request, env, "maintenance");
  }

  if (hasStaticPageAlias(slug)) {
    return renderAsset(request, env, staticPageAliasPath(slug));
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
    context.waitUntil?.(
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
    context.waitUntil?.(
      logAnalyticsEvent(env, request, {
        event: "short-link-miss",
        slug,
        correlation_id: correlationId,
        effective_state: effectiveState
      })
    );

    if (hasStatePage(effectiveState)) {
      return renderStatePage(request, env, effectiveState);
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

  const target = resolveTarget(route, link, request, splat);

  context.waitUntil?.(
    logAnalyticsEvent(env, request, {
      event: "redirect",
      slug,
      correlation_id: correlationId,
      target_host: safeHostname(target),
      effective_state: effectiveState,
      status: route.status || 302
    })
  );

  return Response.redirect(target, route.status || 302);
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeSlug(pathname) {
  return decodeURIComponent(pathname)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function shouldBypassToAssets(slug) {
  if (slug === "") return true;

  if (slug === "_stats" || slug.startsWith("_stats/")) return true;
  if (slug === "expand" || slug.startsWith("expand/")) return true;

  if (slug === "v8s.json" || slug === "v8s-blocklist.json" || slug === "v8s-site-config.json") return false;

  return /\.(html|css|js|json|png|svg|ico|webmanifest|txt|xml)$/i.test(slug);
}

async function loadRegistry(request, env) {
  const registryUrl = new URL("/v8s.json", request.url);

  const registryRequest = new Request(registryUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  const response = await env.ASSETS.fetch(registryRequest);

  if (!response.ok) {
    throw new Error(`Unable to load registry: ${response.status}`);
  }

  return response.json();
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

  const splats = links.filter((link) => link.match === "splat").sort((a, b) => b.slug.length - a.slug.length);

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

function resolveTarget(route, link, request, splat) {
  let target;

  if (route.target === "link.target") {
    target = link.target;
  } else {
    target = new URL(route.target, request.url).toString();
  }

  if (splat) {
    target = target.replaceAll(":splat", splat);
  }

  return target;
}

/* -------------------------------------------------------------------------- */
/* Static pages                                                                */
/* -------------------------------------------------------------------------- */

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

async function renderStatePage(request, env, state) {
  const page = statePages[state];

  if (!page) {
    return render404(request, env, {
      slug: state,
      correlationId: crypto.randomUUID()
    });
  }

  return renderAsset(request, env, page.assetPath, page.status);
}

async function renderAsset(request, env, assetPath, status = 200) {
  const assetUrl = new URL(assetPath, request.url);

  const assetRequest = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);

  return new Response(response.body, {
    status,
    headers
  });
}

async function render404(request, env, { slug, correlationId }) {
  try {
    const assetUrl = new URL("/404.html", request.url);

    const assetRequest = new Request(assetUrl.toString(), {
      method: "GET",
      headers: request.headers
    });

    const response = await env.ASSETS.fetch(assetRequest);

    let body = await response.text();

    body = body
      .replaceAll("{{CORRELATION_ID}}", escapeHtml(correlationId))
      .replaceAll("{{SLUG_MESSAGE}}", renderSlugMessage(slug))
      .replaceAll("{{REFERENCE_LINE}}", renderReferenceLine(correlationId));

    if (!body.includes(correlationId)) {
      body = body.replace("Reference:", `Reference: ${escapeHtml(correlationId)}`);
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("x-correlation-id", correlationId);

    return new Response(body, {
      status: 404,
      headers
    });
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

function renderSlugMessage(slug) {
  if (!slug) return "";

  return `<p class="slug-note">Requested slug: <code>${escapeHtml(slug)}</code></p>`;
}

function renderReferenceLine(correlationId) {
  return `<p class="reference">Reference: <code>${escapeHtml(correlationId)}</code></p>`;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

async function logAnalyticsEvent(env, request, data) {
  try {
    if (env.ANALYTICS_PROVIDER !== "umami") return;
    if (!env.UMAMI_WEBSITE_ID) return;

    const endpoint = normalizeUmamiEndpoint(env.UMAMI_ENDPOINT || "https://cloud.umami.is/api/send");

    const requestUrl = new URL(request.url);

    const payload = {
      type: "event",
      payload: {
        website: env.UMAMI_WEBSITE_ID,
        name: data.event,
        url: requestUrl.pathname + requestUrl.search,
        hostname: requestUrl.hostname,
        language: request.headers.get("accept-language") || "",
        referrer: request.headers.get("referer") || "",
        screen: "unknown",
        data: {
          event_type: data.event,
          slug: data.slug || "",
          correlation_id: data.correlation_id || "",
          target_host: data.target_host || "",
          effective_state: data.effective_state || "",
          status: String(data.status || ""),
          country: request.cf?.country || "",
          colo: request.cf?.colo || "",
          url_path: requestUrl.pathname,
          url_query: requestUrl.search.replace(/^\?/, ""),
          url_full_path: requestUrl.pathname + requestUrl.search,
          hostname: requestUrl.hostname
        }
      }
    };

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") || "vanityurls-worker"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Analytics must never break redirects.
  }
}

function normalizeUmamiEndpoint(value) {
  const url = new URL(value);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api/send";
  }

  return url.toString();
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
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
