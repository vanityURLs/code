(function submitBrowserCode() {
  // Only en/fr are translated so far, unlike v8s-lookup.js's full en/fr/es/it/de set — es/it/de
  // instances fall back to English below. Translation contributions welcome.
  const SUBMIT_LABELS = {
    en: {
      empty: "Paste a URL to shorten",
      invalid: "Enter a valid http(s) URL",
      invalidSlug: "Use only letters, numbers, and - . _ ~",
      error: "Unable to create the short link",
      pending: "Creating your short link…",
      shortcode: "Your new short link",
      track: "Track the pipeline",
      copy: "Copy",
      copied: "Copied!",
      eta: (minutes) => `Typically live within ~${minutes} minute${minutes === 1 ? "" : "s"}.`
    },
    fr: {
      empty: "Collez une URL à raccourcir",
      invalid: "Entrez une URL http(s) valide",
      invalidSlug: "Utilisez seulement des lettres, chiffres et - . _ ~",
      error: "Impossible de créer le lien court",
      pending: "Création du lien court…",
      shortcode: "Votre nouveau lien court",
      track: "Suivre le pipeline",
      copy: "Copier",
      copied: "Copié!",
      eta: (minutes) => `Généralement en ligne d'ici ~${minutes} minute${minutes === 1 ? "" : "s"}.`
    }
  };

  const submitLanguage = String(document.documentElement.lang || "en")
    .toLowerCase()
    .split("-")[0];
  const LABELS = SUBMIT_LABELS[submitLanguage] || SUBMIT_LABELS.en;

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("submitForm");
    const input = document.getElementById("submitUrl");
    const slugInput = document.getElementById("submitSlug");
    const result = document.getElementById("submitResult");

    if (!form || !input || !result) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitUrl(form, input, slugInput, result);
    });
  });

  async function submitUrl(form, input, slugInput, result) {
    const url = input.value.trim();

    if (!url) {
      renderMessage(result, LABELS.empty, true);
      return;
    }

    if (!isHttpUrl(url)) {
      renderMessage(result, LABELS.invalid, true);
      return;
    }

    const slug = normalizeSlugInput(slugInput?.value);

    if (slug && !isValidSlugFormat(slug)) {
      renderMessage(result, LABELS.invalidSlug, true);
      return;
    }

    const submitButton = form.querySelector("button[type=submit]");
    submitButton?.setAttribute("disabled", "disabled");
    renderMessage(result, LABELS.pending, false);

    try {
      const response = await fetch("/add/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slug ? { url, slug } : { url }),
        cache: "no-store"
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.slug) {
        renderMessage(result, body.error || LABELS.error, true);
        return;
      }

      renderShortcode(result, body);
      form.reset();
    } catch {
      renderMessage(result, LABELS.error, true);
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  }

  function isHttpUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function normalizeSlugInput(value) {
    return String(value || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  function isValidSlugFormat(slug) {
    if (slug.includes("//") || slug.includes("?") || slug.includes("#") || slug.includes("|")) return false;
    return slug.split("/").every((part) => /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(part));
  }

  function renderShortcode(result, { slug, pipelineUrl, etaMinutes }) {
    const shortLink = `${window.location.origin}/${slug}`;

    result.classList.remove("is-error");
    result.classList.add("is-visible");
    result.innerHTML = `
      <p class="submit-label">${escapeHtml(LABELS.shortcode)}</p>
      <p class="submit-shortcode">
        <a href="${escapeAttr(shortLink)}" target="_blank" rel="noreferrer">${escapeHtml(shortLink)}</a>
        <button type="button" class="submit-copy" data-copy="${escapeAttr(shortLink)}">${escapeHtml(LABELS.copy)}</button>
      </p>
      <p class="submit-meta">
        ${escapeHtml(etaMinutes ? LABELS.eta(etaMinutes) : "")}
        ${pipelineUrl ? `<a href="${escapeAttr(pipelineUrl)}" target="_blank" rel="noreferrer">${escapeHtml(LABELS.track)}</a>` : ""}
      </p>
    `;

    const copyButton = result.querySelector(".submit-copy");
    copyButton?.addEventListener("click", () => {
      navigator.clipboard?.writeText(copyButton.dataset.copy || "").then(() => {
        copyButton.textContent = LABELS.copied;
        setTimeout(() => {
          copyButton.textContent = LABELS.copy;
        }, 2000);
      });
    });
  }

  function renderMessage(result, message, isError) {
    result.classList.toggle("is-error", Boolean(isError));
    result.classList.add("is-visible");
    result.innerHTML = `<p class="submit-message">${escapeHtml(message)}</p>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
