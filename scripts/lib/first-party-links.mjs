import { REDIRECT_STATES } from "./constants.mjs";

const REDIRECT_STATE_SET = new Set(REDIRECT_STATES);

export function validateFirstPartyRouteReferences(links, siteConfig = {}, extraDomains = []) {
  const firstPartyDomains = firstPartyHostnames(siteConfig, extraDomains);
  if (!firstPartyDomains.size) return { errors: [], warnings: [] };

  const exactLinks = new Map();
  const splatLinks = [];

  for (const link of links) {
    if (link.match === "splat") {
      splatLinks.push(link);
    } else {
      exactLinks.set(link.slug, link);
    }
  }

  const edges = [];

  for (const link of links) {
    const effectiveState = link.state || "permanent";
    if (!REDIRECT_STATE_SET.has(effectiveState)) continue;

    for (const target of redirectTargets(link)) {
      const reference = firstPartyReference(target, firstPartyDomains, exactLinks, splatLinks);
      if (!reference || reference.type !== "exact") continue;

      edges.push({
        from: link.slug,
        to: reference.slug,
        target
      });
    }
  }

  return {
    errors: cycleErrors(edges),
    warnings: chainWarnings(edges)
  };
}

function firstPartyHostnames(siteConfig, extraDomains) {
  const hostnames = new Set();
  addHostname(hostnames, siteConfig?.operator?.short_domain);
  addHostname(hostnames, siteConfig?.branding?.domain);
  for (const domain of extraDomains) {
    addHostname(hostnames, domain);
  }
  return hostnames;
}

function addHostname(hostnames, value) {
  const hostname = normalizeHostname(value);
  if (hostname) hostnames.add(hostname);
}

function normalizeHostname(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function redirectTargets(link) {
  return [link.target, ...(link.schedule?.rules || []).map((rule) => rule.target)].filter(Boolean);
}

function firstPartyReference(target, firstPartyDomains, exactLinks, splatLinks) {
  let url;

  try {
    url = new URL(target);
  } catch {
    return null;
  }

  const hostname = normalizeHostname(url.hostname);
  if (!firstPartyDomains.has(hostname)) return null;

  const slug = normalizeSlug(decodeURIComponentSafe(url.pathname));
  if (!slug) return null;

  if (exactLinks.has(slug)) return { type: "exact", slug };

  const splat = splatLinks.find((link) => slug.startsWith(`${link.slug}/`));
  if (splat) return { type: "splat", slug: splat.slug };

  return null;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function chainWarnings(edges) {
  const warnings = [];

  for (const edge of edges) {
    warnings.push(
      `first-party exact alias "${edge.from}" targets "${edge.to}" via ${edge.target}; prefer duplicate long URLs or a direct splat namespace reference`
    );
  }

  return [...new Set(warnings)];
}

function cycleErrors(edges) {
  const graph = new Map();

  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from).push(edge.to);
  }

  const cycles = new Set();
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(slug) {
    if (visiting.has(slug)) {
      const start = stack.indexOf(slug);
      const cycle = [...stack.slice(start), slug];
      cycles.add(canonicalCycle(cycle));
      return;
    }

    if (visited.has(slug)) return;

    visiting.add(slug);
    stack.push(slug);

    for (const next of graph.get(slug) || []) {
      visit(next);
    }

    stack.pop();
    visiting.delete(slug);
    visited.add(slug);
  }

  for (const slug of graph.keys()) {
    visit(slug);
  }

  return [...cycles].map((cycle) => `first-party alias loop detected: ${cycle}`);
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)]);
  const canonical = rotations.map((rotation) => rotation.join(" -> ")).sort()[0];
  const first = canonical.split(" -> ")[0];
  return `${canonical} -> ${first}`;
}
