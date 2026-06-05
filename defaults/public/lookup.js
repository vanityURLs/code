(function lookupBrowserCode() {
  const LOOKUP_LABELS = {
    en: {
      empty: "Enter a short link to preview its destination",
      miss: "No matching short link was found",
      notRedirecting: "This short link is not currently redirecting",
      error: "Unable to load short link data",
      challenge: "Complete the verification before previewing this link",
      notConfigured: "Lookup verification is not configured",
      preview: "Preview",
      destination: "Link destination"
    },
    fr: {
      empty: "Saisissez un lien court pour voir sa destination",
      miss: "Aucun lien court correspondant n'a été trouvé",
      notRedirecting: "Ce lien court ne redirige pas actuellement",
      error: "Impossible de charger les données des liens courts",
      challenge: "Terminez la vérification avant de prévisualiser ce lien",
      notConfigured: "La vérification lookup n'est pas configurée",
      preview: "Aperçu",
      destination: "Destination du lien"
    },
    es: {
      empty: "Introduce un enlace corto para previsualizar su destino",
      miss: "No se encontró ningún enlace corto coincidente",
      notRedirecting: "Este enlace corto no está redirigiendo actualmente",
      error: "No se pudieron cargar los datos de enlaces cortos",
      challenge: "Completa la verificación antes de previsualizar este enlace",
      notConfigured: "La verificación de consulta no está configurada",
      preview: "Vista previa",
      destination: "Destino del enlace"
    },
    it: {
      empty: "Inserisci un link breve per visualizzarne la destinazione",
      miss: "Nessun link breve corrispondente trovato",
      notRedirecting: "Questo link breve al momento non reindirizza",
      error: "Impossibile caricare i dati dei link brevi",
      challenge: "Completa la verifica prima di visualizzare questo link",
      notConfigured: "La verifica lookup non è configurata",
      preview: "Anteprima",
      destination: "Destinazione del link"
    },
    de: {
      empty: "Geben Sie einen Kurzlink ein, um sein Ziel anzuzeigen",
      miss: "Kein passender Kurzlink gefunden",
      notRedirecting: "Dieser Kurzlink leitet derzeit nicht weiter",
      error: "Kurzlinkdaten konnten nicht geladen werden",
      challenge: "Schließen Sie die Verifizierung ab, bevor Sie diesen Link anzeigen",
      notConfigured: "Lookup-Verifizierung ist nicht konfiguriert",
      preview: "Vorschau",
      destination: "Linkziel"
    }
  };

  const lookupLanguage = String(document.documentElement.lang || "en")
    .toLowerCase()
    .split("-")[0];
  const labels = LOOKUP_LABELS[lookupLanguage] || LOOKUP_LABELS.en;
  const turnstileState = {
    enabled: false,
    ready: null,
    token: "",
    widgetId: null
  };

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("lookupForm");
    const input = document.getElementById("lookupKey");
    const result = document.getElementById("lookupResult");

    if (!form || !input || !result) return;

    turnstileState.ready = prepareTurnstile(form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const slug = normalizeSlug(input.value);
      input.value = slug;
      syncFormState(form, input);

      if (!slug) {
        renderMessage(result, labels.empty);
        return;
      }

      try {
        const turnstileToken = await currentTurnstileToken(result);
        const lookup = await lookupSlug(slug, turnstileToken);
        resetTurnstile();

        if (lookup.result === "miss") {
          renderMessage(result, labels.miss);
          trackLookup(slug, "", "", "miss");
          return;
        }

        const state = lookup.state || "";
        if (lookup.result !== "resolved" || !lookup.target) {
          renderMessage(result, labels.notRedirecting);
          trackLookup(slug, state, "", "not-redirecting");
          return;
        }

        renderTarget(result, slug, lookup.target, state);
        trackLookup(slug, state, lookup.target, "resolved");
      } catch (error) {
        resetTurnstile();
        if (error?.name === "TurnstileRequiredError") return;
        renderMessage(result, turnstileState.configurationError || labels.error);
        trackLookup(slug, "", "", "error");
      }
    });

    input.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^a-zA-Z0-9\-_\/]/g, "");
      syncFormState(form, input);
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const pasted = (event.clipboardData || window.clipboardData).getData("text");
      input.value = normalizeSlug(pasted);
      syncFormState(form, input);
    });

    syncFormState(form, input);
  });

  function syncFormState(form, input) {
    form.classList.toggle("has-value", input.value.trim().length > 0);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\/[^/]+\//i, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/\/{2,}/g, "/")
      .replace(/[^a-zA-Z0-9\-_\/]/g, "")
      .slice(0, 99);
  }

  async function lookupSlug(slug, turnstileToken) {
    const response = await fetch("/lookup/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, turnstileToken }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Unable to load lookup data");
    return response.json();
  }

  async function prepareTurnstile(form) {
    let config = {};

    try {
      const response = await fetch("/lookup/turnstile-config", { cache: "no-store" });
      if (response.ok) config = await response.json();
    } catch {
      config = {};
    }

    if (!config.configured || !config.siteKey) {
      turnstileState.configurationError = labels.notConfigured;
      return;
    }

    turnstileState.enabled = true;
    const container = document.createElement("div");
    container.className = "lookup-turnstile";
    container.setAttribute("aria-hidden", "false");
    form.insertAdjacentElement("afterend", container);

    await loadTurnstileScript();

    turnstileState.widgetId = window.turnstile.render(container, {
      sitekey: config.siteKey,
      action: "lookup",
      callback: (token) => {
        turnstileState.token = token;
      },
      "expired-callback": () => {
        turnstileState.token = "";
      },
      "error-callback": () => {
        turnstileState.token = "";
      }
    });
  }

  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-v8s-turnstile="true"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.v8sTurnstile = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  }

  async function currentTurnstileToken(result) {
    if (turnstileState.ready) await turnstileState.ready;
    if (turnstileState.configurationError) {
      renderMessage(result, turnstileState.configurationError);
      const error = new Error("Turnstile configuration is required");
      error.name = "TurnstileRequiredError";
      throw error;
    }
    if (!turnstileState.enabled) return "";
    if (turnstileState.token) return turnstileState.token;

    renderMessage(result, labels.challenge);
    const error = new Error("Turnstile token is required");
    error.name = "TurnstileRequiredError";
    throw error;
  }

  function resetTurnstile() {
    if (!turnstileState.enabled || turnstileState.widgetId === null || !window.turnstile) return;
    turnstileState.token = "";
    window.turnstile.reset(turnstileState.widgetId);
  }

  function renderMessage(result, message) {
    result.classList.add("is-visible");
    result.innerHTML = `
      <p class="lookup-label">${escapeHtml(labels.preview)}</p>
      <p class="lookup-target">${escapeHtml(message)}</p>
    `;
  }

  function renderTarget(result, slug, target, state) {
    result.classList.add("is-visible");
    result.innerHTML = `
      <p class="lookup-label">${escapeHtml(labels.destination)}</p>
      <p class="lookup-target"><a href="${escapeAttr(target)}" target="_blank" rel="noreferrer">${escapeHtml(target)}</a></p>
      <p class="lookup-meta">/${escapeHtml(slug)} · ${escapeHtml(state)}</p>
    `;
  }

  function trackLookup(slug, state, target, result) {
    const body = JSON.stringify({ slug, state, target, result });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/_analytics/lookup", blob);
      return;
    }

    fetch("/_analytics/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
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
