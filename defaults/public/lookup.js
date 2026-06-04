(function lookupBrowserCode() {
  const LOOKUP_LABELS = {
    en: {
      empty: "Enter a short link to preview its destination",
      miss: "No matching short link was found",
      notRedirecting: "This short link is not currently redirecting",
      error: "Unable to load short link data",
      preview: "Preview",
      destination: "Link destination"
    },
    fr: {
      empty: "Saisissez un lien court pour voir sa destination",
      miss: "Aucun lien court correspondant n'a été trouvé",
      notRedirecting: "Ce lien court ne redirige pas actuellement",
      error: "Impossible de charger les données des liens courts",
      preview: "Aperçu",
      destination: "Destination du lien"
    },
    es: {
      empty: "Introduce un enlace corto para previsualizar su destino",
      miss: "No se encontró ningún enlace corto coincidente",
      notRedirecting: "Este enlace corto no está redirigiendo actualmente",
      error: "No se pudieron cargar los datos de enlaces cortos",
      preview: "Vista previa",
      destination: "Destino del enlace"
    },
    it: {
      empty: "Inserisci un link breve per visualizzarne la destinazione",
      miss: "Nessun link breve corrispondente trovato",
      notRedirecting: "Questo link breve al momento non reindirizza",
      error: "Impossibile caricare i dati dei link brevi",
      preview: "Anteprima",
      destination: "Destinazione del link"
    },
    de: {
      empty: "Geben Sie einen Kurzlink ein, um sein Ziel anzuzeigen",
      miss: "Kein passender Kurzlink gefunden",
      notRedirecting: "Dieser Kurzlink leitet derzeit nicht weiter",
      error: "Kurzlinkdaten konnten nicht geladen werden",
      preview: "Vorschau",
      destination: "Linkziel"
    }
  };

  const lookupLanguage = String(document.documentElement.lang || "en")
    .toLowerCase()
    .split("-")[0];
  const labels = LOOKUP_LABELS[lookupLanguage] || LOOKUP_LABELS.en;

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("lookupForm");
    const input = document.getElementById("lookupKey");
    const result = document.getElementById("lookupResult");

    if (!form || !input || !result) return;

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
        const lookup = await lookupSlug(slug);

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
      } catch {
        renderMessage(result, labels.error);
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

  async function lookupSlug(slug) {
    const response = await fetch("/_lookup?slug=" + encodeURIComponent(slug), { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load lookup data");
    return response.json();
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
