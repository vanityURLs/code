import fs from "node:fs";
import net from "node:net";

const DEFAULT_POLICY_PATH = "defaults/v8s-policies.json";
const LEGACY_POLICY_PATH = "defaults/v8s-blocklist.json";
const DEFAULT_CUSTOM_POLICY_PATH = "custom/v8s-policies.json";
const LEGACY_CUSTOM_POLICY_PATH = "custom/v8s-blocklist.json";
const DEFAULT_GENERATED_POLICY_PATH = "build/blocklist.generated.json";

export function loadBlocklistPolicy(path = DEFAULT_POLICY_PATH) {
  const resolvedPath = resolvePolicyPath(path, LEGACY_POLICY_PATH);
  const raw = fs.existsSync(resolvedPath) ? JSON.parse(fs.readFileSync(resolvedPath, "utf8")) : {};
  const isDefaultPolicy = path === DEFAULT_POLICY_PATH || path === LEGACY_POLICY_PATH;
  const customPath = resolvePolicyPath(DEFAULT_CUSTOM_POLICY_PATH, LEGACY_CUSTOM_POLICY_PATH);
  const custom = isDefaultPolicy && fs.existsSync(customPath)
    ? JSON.parse(fs.readFileSync(customPath, "utf8"))
    : {};
  const generated = isDefaultPolicy && fs.existsSync(DEFAULT_GENERATED_POLICY_PATH)
    ? JSON.parse(fs.readFileSync(DEFAULT_GENERATED_POLICY_PATH, "utf8"))
    : {};
  const ownerPolicy = isDefaultPolicy ? mergePolicy(custom, raw) : raw;

  return normalizePolicy(mergePolicy(ownerPolicy, generated));
}

function resolvePolicyPath(primary, legacy) {
  if (fs.existsSync(primary)) return primary;
  if (legacy && fs.existsSync(legacy)) return legacy;
  return primary;
}

export function checkTargetUrl(target, policy = loadBlocklistPolicy()) {
  const violations = [];
  let url;

  try {
    url = new URL(target);
  } catch {
    return [`invalid URL: ${target}`];
  }

  const protocol = url.protocol.toLowerCase();
  const hostname = normalizeHostname(url.hostname);
  const path = decodeURIComponentSafe(url.pathname).toLowerCase();

  if (!policy.allowedProtocols.has(protocol)) {
    violations.push(`protocol '${protocol}' is not allowed`);
  }

  if (policy.blockAuthInUrl && (url.username || url.password)) {
    violations.push("credentials in URLs are not allowed");
  }

  if (isAllowedDomain(hostname, policy)) {
    return violations;
  }

  if (policy.blockLocalhost && isLocalhost(hostname)) {
    violations.push(`hostname '${hostname}' is local-only`);
  }

  if (policy.blockPrivateNetworks && isPrivateOrReservedHost(hostname)) {
    violations.push(`hostname '${hostname}' resolves to a private or reserved address form`);
  }

  const blockedDomain = findBlockedDomain(hostname, policy);
  if (blockedDomain) {
    violations.push(`hostname '${hostname}' matches blocklist domain '${blockedDomain.domain}' (${blockedDomain.category})`);
  }

  const blockedKeyword = findBlockedKeyword(url, policy);
  if (blockedKeyword) {
    violations.push(`target contains blocked keyword '${blockedKeyword.keyword}' (${blockedKeyword.category})`);
  }

  const extension = policy.blockedFileExtensions.find((suffix) => path.endsWith(suffix));
  if (extension) {
    violations.push(`target path ends with blocked file extension '${extension}'`);
  }

  return violations;
}

function normalizePolicy(raw) {
  const defaults = raw.defaults || {};
  const blockDomains = Array.isArray(raw.block_domains) ? raw.block_domains : [];
  const allowDomains = Array.isArray(raw.allow_domains) ? raw.allow_domains : [];
  const blockedKeywords = Array.isArray(raw.blocked_keywords) ? raw.blocked_keywords : [];
  const allowedProtocols = Array.isArray(defaults.allowed_protocols) ? defaults.allowed_protocols : ["http:", "https:"];
  const blockedFileExtensions = Array.isArray(defaults.blocked_file_extensions) ? defaults.blocked_file_extensions : [];

  return {
    allowedProtocols: new Set(allowedProtocols.map((protocol) => String(protocol).toLowerCase())),
    blockPrivateNetworks: defaults.block_private_networks !== false,
    blockLocalhost: defaults.block_localhost !== false,
    blockAuthInUrl: defaults.block_auth_in_url !== false,
    blockedFileExtensions: blockedFileExtensions.map((suffix) => String(suffix).toLowerCase()),
    allowDomains: allowDomains
      .map((entry) => normalizeAllowDomainEntry(entry))
      .filter((entry) => entry.domain && entry.enabled !== false),
    blockedKeywords: blockedKeywords
      .map((entry) => normalizeKeywordEntry(entry))
      .filter((entry) => entry.keyword),
    blockDomains: blockDomains
      .map((entry) => ({
        ...entry,
        domain: normalizeHostname(entry.domain),
        category: entry.category || "blocked"
      }))
      .filter((entry) => entry.domain)
  };
}

function mergePolicy(localPolicy, generatedPolicy) {
  const localDefaults = localPolicy.defaults || {};
  const generatedDefaults = generatedPolicy.defaults || {};

  return {
    ...generatedPolicy,
    ...localPolicy,
    defaults: {
      ...generatedDefaults,
      ...localDefaults,
      allowed_protocols: mergeArray(generatedDefaults.allowed_protocols, localDefaults.allowed_protocols),
      blocked_file_extensions: mergeArray(generatedDefaults.blocked_file_extensions, localDefaults.blocked_file_extensions)
    },
    allow_domains: mergeAllowDomains(generatedPolicy.allow_domains, localPolicy.allow_domains),
    blocked_keywords: mergeKeywordEntries(generatedPolicy.blocked_keywords, localPolicy.blocked_keywords),
    block_domains: mergeBlockDomains(generatedPolicy.block_domains, localPolicy.block_domains)
  };
}

function mergeArray(first = [], second = []) {
  return [...new Set([...asArray(first), ...asArray(second)])];
}

function mergeAllowDomains(first = [], second = []) {
  const merged = new Map();

  for (const entry of [...asArray(first), ...asArray(second)]) {
    const normalized = normalizeAllowDomainEntry(entry);
    if (!normalized.domain) continue;

    merged.set(normalized.domain, normalized);
  }

  return [...merged.values()];
}

function mergeBlockDomains(first = [], second = []) {
  const merged = new Map();

  for (const entry of [...asArray(first), ...asArray(second)]) {
    if (!entry || typeof entry !== "object") continue;

    const domain = normalizeHostname(entry.domain);
    if (!domain) continue;

    merged.set(domain, {
      ...entry,
      domain
    });
  }

  return [...merged.values()];
}

function mergeKeywordEntries(first = [], second = []) {
  const merged = new Map();

  for (const entry of [...asArray(first), ...asArray(second)]) {
    const normalized = normalizeKeywordEntry(entry);
    if (!normalized.keyword) continue;

    merged.set(normalized.keyword, normalized);
  }

  return [...merged.values()];
}

function normalizeKeywordEntry(entry) {
  if (typeof entry === "string") {
    return {
      keyword: normalizeKeyword(entry),
      category: "custom",
      severity: "medium"
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      keyword: ""
    };
  }

  return {
    ...entry,
    keyword: normalizeKeyword(entry.keyword),
    category: entry.category || "custom",
    severity: entry.severity || "medium"
  };
}

function normalizeAllowDomainEntry(entry) {
  if (typeof entry === "string") {
    return {
      domain: normalizeHostname(entry),
      enabled: true
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      domain: "",
      enabled: false
    };
  }

  return {
    ...entry,
    domain: normalizeHostname(entry.domain),
    enabled: entry.enabled !== false
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

function isAllowedDomain(hostname, policy) {
  return policy.allowDomains.some((entry) => domainMatches(hostname, entry.domain));
}

function findBlockedDomain(hostname, policy) {
  return policy.blockDomains.find((entry) => domainMatches(hostname, entry.domain));
}

function findBlockedKeyword(url, policy) {
  const haystack = normalizeKeyword(`${url.hostname}${url.pathname}${url.search}`);
  return policy.blockedKeywords.find((entry) => haystack.includes(entry.keyword));
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

function isPrivateOrReservedHost(hostname) {
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) return isPrivateOrReservedIpv4(hostname);
  if (ipVersion === 6) return isPrivateOrReservedIpv6(hostname);

  return false;
}

function isPrivateOrReservedIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 203 && b === 0) return true;

  return false;
}

function isPrivateOrReservedIpv6(hostname) {
  const value = hostname.toLowerCase();

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80") ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8")
  );
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeKeyword(value) {
  return decodeURIComponentSafe(String(value || ""))
    .trim()
    .toLowerCase();
}
