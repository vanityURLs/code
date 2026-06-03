const DEFAULT_EVENTS = ["redirect", "short-link-miss", "lookup", "bot"];
const API_BASE = "https://api.usefathom.com/v1";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const siteId = process.env.FATHOM_SITE_ID || "";
const token = process.env.FATHOM_API_TOKEN || process.env.FATHOM_API || "";

if (!siteId || !token) {
  console.error("FATHOM_SITE_ID and FATHOM_API_TOKEN or FATHOM_API are required.");
  console.error("Example:");
  console.error("  FATHOM_SITE_ID=ABCDEFG FATHOM_API=... npm run fathom:events -- --apply");
  process.exit(1);
}

const events = eventNames();
const existing = await listEvents(siteId);
const existingNames = new Set(existing.map((event) => event.name));
const missing = events.filter((name) => !existingNames.has(name));

console.log(
  JSON.stringify(
    {
      site: siteId,
      mode: apply ? "apply" : "dry-run",
      desired_events: events,
      existing_events: existing.map((event) => ({
        id: event.id,
        name: event.name
      })),
      missing_events: missing
    },
    null,
    2
  )
);

if (!apply) {
  console.log("\nDry run only. Add --apply to create missing events.");
  process.exit(0);
}

for (const name of missing) {
  const created = await createEvent(siteId, name);
  console.log(`Created Fathom event: ${created.name} (${created.id})`);
}

if (!missing.length) {
  console.log("All Fathom events already exist.");
}

function eventNames() {
  const configured = process.env.FATHOM_EVENTS || "";
  const values = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length ? values : DEFAULT_EVENTS;
}

async function listEvents(site) {
  const response = await fathomFetch(`/sites/${encodeURIComponent(site)}/events?limit=100`);

  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.events)) return response.events;

  return [];
}

async function createEvent(site, name) {
  const body = new URLSearchParams({ name });
  return fathomFetch(`/sites/${encodeURIComponent(site)}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
}

async function fathomFetch(pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...init.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Fathom API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}
