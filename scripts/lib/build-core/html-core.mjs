const DEFAULT_PUBLIC_ASSET_VERSION = "20260601";

export const THEME_OVERRIDE_SCRIPT = themeOverrideScript();

export function normalizeHtmlHead(html, options = {}) {
  const assetVersion = options.assetVersion || DEFAULT_PUBLIC_ASSET_VERSION;
  let normalized = normalizePublicAssetVersions(html, assetVersion);
  normalized = replaceInlineThemeOverride(normalized, assetVersion);

  if (!normalized.includes('rel="icon"')) {
    normalized = insertBeforeHeadClose(normalized, '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n');
  }

  if (!normalized.includes('rel="apple-touch-icon"')) {
    normalized = insertBeforeHeadClose(normalized, '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n');
  }

  if (!normalized.includes("/v8s-theme.js")) {
    normalized = insertBeforeFirstStylesheet(normalized, `${themeOverrideScript(assetVersion)}\n`);
  }

  return normalized;
}

export function normalizePublicAssetVersions(html, assetVersion = DEFAULT_PUBLIC_ASSET_VERSION) {
  return html
    .replace(/(href=["']\/v8s-style\.css)(?:\?v=\d+)?(["'])/g, `$1?v=${assetVersion}$2`)
    .replace(/(src=["']\/v8s-theme\.js)(?:\?v=\d+)?(["'])/g, `$1?v=${assetVersion}$2`);
}

export function themeOverrideScript(assetVersion = DEFAULT_PUBLIC_ASSET_VERSION) {
  return `  <script src="/v8s-theme.js?v=${assetVersion}"></script>`;
}

function replaceInlineThemeOverride(html, assetVersion) {
  return html.replace(
    /\s*<script data-v8s-theme-override>[\s\S]*?<\/script>\n?/,
    `\n${themeOverrideScript(assetVersion)}\n`
  );
}

export function insertBeforeHeadClose(html, insertion) {
  return html.replace(/<\/head>/i, `${insertion}</head>`);
}

export function insertBeforeFirstStylesheet(html, insertion) {
  if (/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/i.test(html)) {
    return html.replace(/(<link\s+[^>]*rel=["']stylesheet["'][^>]*>)/i, `${insertion}$1`);
  }

  return insertBeforeHeadClose(html, insertion);
}
