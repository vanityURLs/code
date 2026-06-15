(() => {
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme !== "light" && theme !== "dark") return;

  document.documentElement.dataset.theme = theme;

  const applyThemeImages = () => {
    document.querySelectorAll('picture source[media*="prefers-color-scheme"][srcset]').forEach((source) => {
      const image = source.parentElement?.querySelector("img");
      const candidate =
        theme === "dark"
          ? source.getAttribute("srcset")?.split(",")[0]?.trim()?.split(/\s+/)[0]
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
