const DEFAULT_AVOID_DOMAINS = new Set(["spotify.app.link", "spotify.link"]);

export function normalizeReplacementUrl(target, finalUrl, siteConfig = {}) {
  const targetUrl = parseUrl(target);
  const replacementUrl = parseUrl(finalUrl);
  if (!targetUrl || !replacementUrl) return { kind: "avoid", url: finalUrl, reason: "invalid-url" };

  const targetHostname = targetUrl.hostname.toLowerCase();
  const hostname = replacementUrl.hostname.toLowerCase();

  if (DEFAULT_AVOID_DOMAINS.has(targetHostname) || DEFAULT_AVOID_DOMAINS.has(hostname)) {
    return { kind: "avoid", url: replacementUrl.toString(), reason: "deep-link-share-domain" };
  }

  const youtube = normalizeYouTubeUrl(targetUrl, replacementUrl);
  if (youtube) return { kind: "good", url: youtube, reason: "youtube-canonical" };

  const amazon = normalizeAmazonUrl(replacementUrl, siteConfig);
  if (amazon) return { kind: "good", url: amazon, reason: "amazon-canonical" };

  return { kind: "good", url: replacementUrl.toString(), reason: "resolved-final-url" };
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(targetUrl, replacementUrl) {
  const targetHost = targetUrl.hostname.toLowerCase();
  const replacementHost = replacementUrl.hostname.toLowerCase();
  if (targetHost !== "youtu.be") return "";
  if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(replacementHost)) return "";

  const videoId = replacementUrl.searchParams.get("v") || targetUrl.pathname.replace(/^\/+/, "").split("/")[0];
  if (!videoId) return "";

  const normalized = new URL("https://www.youtube.com/watch");
  normalized.searchParams.set("v", videoId);

  for (const key of ["t", "start"]) {
    const value = replacementUrl.searchParams.get(key) || targetUrl.searchParams.get(key);
    if (value) normalized.searchParams.set(key, value);
  }

  const list = replacementUrl.searchParams.get("list") || targetUrl.searchParams.get("list");
  if (list) {
    normalized.searchParams.set("list", list);
    const index = replacementUrl.searchParams.get("index") || targetUrl.searchParams.get("index");
    if (index) normalized.searchParams.set("index", index);
  }

  return normalized.toString();
}

function normalizeAmazonUrl(replacementUrl, siteConfig) {
  const host = replacementUrl.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^amazon\.[a-z.]+$/.test(host)) return "";

  const asin = amazonAsin(replacementUrl);
  if (!asin) return "";

  const normalized = new URL(`${replacementUrl.protocol}//${replacementUrl.hostname}/dp/${asin}`);
  const tag = amazonAffiliateTag(replacementUrl, siteConfig);
  if (tag) normalized.searchParams.set("tag", tag);
  return normalized.toString();
}

function amazonAsin(url) {
  const patterns = [/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i, /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i];
  for (const pattern of patterns) {
    const match = url.pathname.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return "";
}

function amazonAffiliateTag(url, siteConfig) {
  const normalizer = siteConfig?.targets?.normalizers?.amazon || {};
  if (normalizer.preserve_affiliate_tag !== true) return "";

  const tag = String(url.searchParams.get("tag") || "").trim();
  const allowed = Array.isArray(normalizer.allowed_tags)
    ? normalizer.allowed_tags.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (!tag || !allowed.includes(tag)) return "";
  return tag;
}
