export async function onRequest(context) {
  const { request, env } = context;

  // Load redirect data from static asset
  const url = new URL(request.url);
  const dataUrl = new URL('/v8s.json', url);

  const res = await env.ASSETS.fetch(new Request(dataUrl));

  if (!res.ok) {
    return new Response('Unable to load redirect data', { status: 500 });
  }

  const data = await res.json();

  // Normalize entries
  const staticEntries = Object.entries(data.static || {}).map(([source, v]) => ({
    type: 'static',
    source,
    target: v.target,
    status: v.status,
    description: v.description || ''
  }));

  const dynamicEntries = (data.dynamic || []).map((v) => ({
    type: 'dynamic',
    source: v.source,
    target: v.target,
    status: v.status,
    description: v.description || ''
  }));

  const all = [...staticEntries, ...dynamicEntries];

  // ------------------------
  // Diagnostics
  // ------------------------

  // Duplicate targets
  const duplicatesMap = {};
  for (const r of all) {
    if (!r.target) continue;
    if (!duplicatesMap[r.target]) {
      duplicatesMap[r.target] = [];
    }
    duplicatesMap[r.target].push(r.source);
  }

  const duplicates = Object.entries(duplicatesMap)
    .filter(([, sources]) => sources.length > 1)
    .map(([target, sources]) => ({ target, sources }));

  // Missing descriptions
  const missingDescriptions = all.filter(r => !r.description);

  // Dynamic routes
  const dynamicRoutes = all.filter(r => r.type === 'dynamic');

  // Reserved path violations
  const reservedPrefixes = ['/_stats', '/api', '/_worker', '/v8s.json', '/v8s-blocklist.json', '/v8s-site-config.json'];
  const reservedViolations = all.filter(r =>
    reservedPrefixes.some(prefix => r.source.startsWith(prefix))
  );

  // Status counts
  const statusCounts = {};
  for (const r of all) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  return Response.json({
    total: all.length,
    static: staticEntries.length,
    dynamic: dynamicEntries.length,
    statusCounts,
    duplicates: duplicates.slice(0, 20),
    missingDescriptions: missingDescriptions.slice(0, 50),
    reservedViolations,
    dynamicRoutes: dynamicRoutes.slice(0, 50),
    all
  });
}
