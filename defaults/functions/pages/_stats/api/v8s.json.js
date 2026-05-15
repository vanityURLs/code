export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const dataUrl = new URL("/v8s.json", url);

  const response = await env.ASSETS.fetch(new Request(dataUrl));

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
