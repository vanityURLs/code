const DEFAULT_PUBLIC_ASSET_VERSION = "20260601";

export const THEME_OVERRIDE_SCRIPT = `  <script data-v8s-theme-override>
    (() => {
      const theme = new URLSearchParams(window.location.search).get("theme");
      if (theme !== "light" && theme !== "dark") return;

      document.documentElement.dataset.theme = theme;

      const applyThemeImages = () => {
        document.querySelectorAll('picture source[media*="prefers-color-scheme"][srcset]').forEach((source) => {
          const image = source.parentElement?.querySelector("img");
          const candidate =
            theme === "dark"
              ? source.getAttribute("srcset")?.split(",")[0]?.trim()?.split(/\\s+/)[0]
              : image?.getAttribute("src");
          if (image && candidate) image.src = candidate;
        });
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyThemeImages, { once: true });
      } else {
        applyThemeImages();
      }
    })();
  </script>`;

export function normalizeHtmlHead(html, options = {}) {
  const assetVersion = options.assetVersion || DEFAULT_PUBLIC_ASSET_VERSION;
  let normalized = normalizePublicAssetVersions(html, assetVersion);

  if (!normalized.includes('rel="icon"')) {
    normalized = insertBeforeHeadClose(normalized, '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n');
  }

  if (!normalized.includes('rel="apple-touch-icon"')) {
    normalized = insertBeforeHeadClose(normalized, '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n');
  }

  if (!normalized.includes("data-v8s-theme-override")) {
    normalized = insertBeforeFirstStylesheet(normalized, `${THEME_OVERRIDE_SCRIPT}\n`);
  }

  return normalized;
}

export function normalizePublicAssetVersions(html, assetVersion = DEFAULT_PUBLIC_ASSET_VERSION) {
  return html.replace(/(href=["']\/style\.css)(?:\?v=\d+)?(["'])/g, `$1?v=${assetVersion}$2`);
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
