#!/usr/bin/env node

const UMAMI_API_KEY = process.env.UMAMI_API_KEY || "";
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || "";
const UMAMI_API_REGION = process.env.UMAMI_API_REGION || "eu";

if (!UMAMI_API_KEY || !UMAMI_WEBSITE_ID) {
  console.error("UMAMI_API_KEY and UMAMI_WEBSITE_ID are required.");
  process.exit(1);
}

const base = `https://api.umami.is/v1/${UMAMI_API_REGION}`;
const url = new URL(`${base}/event-data/events`);
url.searchParams.set("websiteId", UMAMI_WEBSITE_ID);
url.searchParams.set("event", "redirect");
url.searchParams.set("startAt", String(Date.now() - 30 * 24 * 60 * 60 * 1000));
url.searchParams.set("endAt", String(Date.now()));
url.searchParams.set("page", "1");
url.searchParams.set("pageSize", "5");

console.log(`GET ${url}`);

const response = await fetch(url, {
  headers: {
    Accept: "application/json",
    "x-umami-api-key": UMAMI_API_KEY
  }
});

const body = await response.text();
console.log(`Status: ${response.status} ${response.statusText}`);
console.log(body);
