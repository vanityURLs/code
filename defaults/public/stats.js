const rowsEl = document.getElementById("rows");
const metricsEl = document.getElementById("metrics");
const searchEl = document.getElementById("search");
const filterSummaryEl = document.getElementById("filter-summary");
const generatedEl = document.getElementById("generated");
const releaseStatusEl = document.getElementById("release-status");
const locale = document.documentElement.lang || "en";
const messages = {
  en: {
    title: "Dashboard",
    searchPlaceholder: "Search path, target, title, description, owner, tags…",
    loadError: "Failed to load registry",
    download: "Download v8s.json",
    noMatches: "No matching routes.",
    generatedFallback: "Generated date unavailable",
    generatedPrefix: "Generated",
    commit: "commit",
    matchingRoutes: "matching route",
    matchingRoutesPlural: "matching routes",
    where: "where",
    search: "search",
    state: "state",
    and: "and",
    or: "or",
    release: "vanityURLs release",
    releaseUnknown: "vanityURLs release unavailable",
    newRelease: "new release available",
    columns: {
      slug: "Slug",
      state: "State",
      title: "Title",
      target: "Target",
      owner: "Owner",
      tags: "Tags",
      expires: "Expires"
    },
    states: {
      total: "Total",
      permanent: "Permanent",
      ephemeral: "Ephemeral",
      expired: "Expired",
      disabled: "Disabled",
      maintenance: "Maintenance",
      deactivated: "Deactivated"
    }
  },
  fr: {
    title: "Tableau de bord",
    searchPlaceholder: "Rechercher chemin, cible, titre, description, responsable, étiquettes…",
    loadError: "Impossible de charger le registre",
    download: "Télécharger v8s.json",
    noMatches: "Aucune route correspondante.",
    generatedFallback: "Date de génération indisponible",
    generatedPrefix: "Généré",
    commit: "commit",
    matchingRoutes: "route correspondante",
    matchingRoutesPlural: "routes correspondantes",
    where: "où",
    search: "recherche",
    state: "état",
    and: "et",
    or: "ou",
    release: "version vanityURLs",
    releaseUnknown: "version vanityURLs indisponible",
    newRelease: "nouvelle version disponible",
    columns: {
      slug: "Slug",
      state: "État",
      title: "Titre",
      target: "Cible",
      owner: "Responsable",
      tags: "Étiquettes",
      expires: "Expiration"
    },
    states: {
      total: "Total",
      permanent: "Permanent",
      ephemeral: "Éphémère",
      expired: "Expiré",
      disabled: "Désactivé",
      maintenance: "Maintenance",
      deactivated: "Désactivé"
    }
  },
  es: {
    title: "Panel",
    searchPlaceholder: "Buscar ruta, destino, título, descripción, responsable, etiquetas…",
    loadError: "No se pudo cargar el registro",
    download: "Descargar v8s.json",
    noMatches: "No hay rutas coincidentes.",
    generatedFallback: "Fecha de generación no disponible",
    generatedPrefix: "Generado",
    commit: "commit",
    matchingRoutes: "ruta coincidente",
    matchingRoutesPlural: "rutas coincidentes",
    where: "donde",
    search: "búsqueda",
    state: "estado",
    and: "y",
    or: "o",
    release: "versión vanityURLs",
    releaseUnknown: "versión vanityURLs no disponible",
    newRelease: "nueva versión disponible",
    columns: {
      slug: "Slug",
      state: "Estado",
      title: "Título",
      target: "Destino",
      owner: "Responsable",
      tags: "Etiquetas",
      expires: "Caduca"
    },
    states: {
      total: "Total",
      permanent: "Permanente",
      ephemeral: "Efímero",
      expired: "Caducado",
      disabled: "Desactivado",
      maintenance: "Mantenimiento",
      deactivated: "Desactivado"
    }
  },
  it: {
    title: "Dashboard",
    searchPlaceholder: "Cerca percorso, destinazione, titolo, descrizione, proprietario, tag…",
    loadError: "Impossibile caricare il registro",
    download: "Scarica v8s.json",
    noMatches: "Nessuna rotta corrispondente.",
    generatedFallback: "Data di generazione non disponibile",
    generatedPrefix: "Generato",
    commit: "commit",
    matchingRoutes: "rotta corrispondente",
    matchingRoutesPlural: "rotte corrispondenti",
    where: "dove",
    search: "ricerca",
    state: "stato",
    and: "e",
    or: "o",
    release: "versione vanityURLs",
    releaseUnknown: "versione vanityURLs non disponibile",
    newRelease: "nuova versione disponibile",
    columns: {
      slug: "Slug",
      state: "Stato",
      title: "Titolo",
      target: "Destinazione",
      owner: "Proprietario",
      tags: "Tag",
      expires: "Scade"
    },
    states: {
      total: "Totale",
      permanent: "Permanente",
      ephemeral: "Effimero",
      expired: "Scaduto",
      disabled: "Disattivato",
      maintenance: "Manutenzione",
      deactivated: "Disattivato"
    }
  },
  de: {
    title: "Dashboard",
    searchPlaceholder: "Pfad, Ziel, Titel, Beschreibung, Besitzer, Tags suchen…",
    loadError: "Registry konnte nicht geladen werden",
    download: "v8s.json herunterladen",
    noMatches: "Keine passenden Routen.",
    generatedFallback: "Erstellungsdatum nicht verfügbar",
    generatedPrefix: "Generiert",
    commit: "Commit",
    matchingRoutes: "passende Route",
    matchingRoutesPlural: "passende Routen",
    where: "mit",
    search: "Suche",
    state: "Status",
    and: "und",
    or: "oder",
    release: "vanityURLs-Version",
    releaseUnknown: "vanityURLs-Version nicht verfügbar",
    newRelease: "neue Version verfügbar",
    columns: {
      slug: "Slug",
      state: "Status",
      title: "Titel",
      target: "Ziel",
      owner: "Besitzer",
      tags: "Tags",
      expires: "Läuft ab"
    },
    states: {
      total: "Gesamt",
      permanent: "Permanent",
      ephemeral: "Ephemer",
      expired: "Abgelaufen",
      disabled: "Deaktiviert",
      maintenance: "Wartung",
      deactivated: "Deaktiviert"
    }
  }
};
const msg = messages[locale] || messages.en;

let allLinks = [];
let registry = null;
const activeStates = new Set();

main().catch((error) => {
  rowsEl.innerHTML = `<tr><td colspan="7">${escapeHtml(msg.loadError)}: ${escapeHtml(error.message)}</td></tr>`;
});

async function main() {
  applyTranslations();
  const response = await fetch("api/v8s.json", { cache: "no-store" });
  registry = await response.json();
  allLinks = flattenRegistry(registry);
  generatedEl.innerHTML = renderGeneratedLine(registry);
  renderReleaseStatus();
  renderMetrics(allLinks);
  applyFilters();
}

searchEl.addEventListener("input", () => {
  applyFilters();
});

metricsEl.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest("button[data-filter-state]");
  if (!button) return;

  const state = button.dataset.filterState;
  if (state === "total") {
    activeStates.clear();
    searchEl.value = "";
  } else if (activeStates.has(state)) {
    activeStates.delete(state);
  } else {
    activeStates.add(state);
  }

  renderMetrics(allLinks);
  applyFilters();
});

function flattenRegistry(registry) {
  if (Array.isArray(registry.links)) {
    return registry.links
      .map((link) => ({ ...link, path: link.slug || "" }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  const root = registry.routes && typeof registry.routes === "object" ? registry.routes : registry.tree;
  const result = [];

  function walk(node, parts) {
    if (!node || typeof node !== "object") return;

    if (node.link && typeof node.link === "object") {
      result.push({ ...node.link, path: node.link.slug || parts.join("/") });
    }

    if (typeof node.target === "string") {
      result.push({ path: parts.join("/"), ...node });
      return;
    }

    for (const [key, child] of Object.entries(node.children || node)) {
      if (
        [
          "schema_version",
          "generated_at",
          "generated_timezone",
          "generated_git",
          "default_state",
          "routing",
          "routes",
          "tree",
          "links",
          "link"
        ].includes(key)
      )
        continue;
      walk(child, [...parts, key]);
    }
  }

  walk(root, []);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function effectiveState(link) {
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return "expired";
  return link.state || registry?.default_state || "permanent";
}

function renderMetrics(links) {
  const counts = { total: links.length };
  for (const link of links) {
    const state = effectiveState(link);
    counts[state] = (counts[state] || 0) + 1;
  }

  const items = ["total", "permanent", "ephemeral", "expired", "disabled", "maintenance", "deactivated"];
  metricsEl.innerHTML = items
    .map(
      (key) => `
        <button class="card" type="button" data-filter-state="${escapeAttr(key)}" aria-pressed="${key !== "total" && activeStates.has(key) ? "true" : "false"}" title="${key === "total" ? msg.states.total : msg.states[key]}">
          <div class="metric">${counts[key] || 0}</div>
          <div class="muted">${label(key)}</div>
        </button>
      `
    )
    .join("");
}

function applyFilters() {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = allLinks.filter((link) => {
    if (activeStates.size && !activeStates.has(effectiveState(link))) return false;
    if (!q) return true;
    return JSON.stringify(link).toLowerCase().includes(q);
  });

  renderRows(filtered);
  renderFilterSummary(filtered.length, q);
}

function renderFilterSummary(count, query) {
  const filters = [];
  if (query) filters.push(`${msg.search} <strong>${escapeHtml(query)}</strong>`);
  if (activeStates.size) {
    filters.push(`${msg.state} <strong>${[...activeStates].map(label).join(` ${msg.or} `)}</strong>`);
  }

  filterSummaryEl.innerHTML = filters.length
    ? `${count} ${count === 1 ? msg.matchingRoutes : msg.matchingRoutesPlural} ${msg.where} ${filters.join(` ${msg.and} `)}`
    : "";
}

function renderRows(links) {
  if (!links.length) {
    rowsEl.innerHTML = `<tr><td colspan="7" class="muted">${escapeHtml(msg.noMatches)}</td></tr>`;
    return;
  }

  rowsEl.innerHTML = links
    .map((link) => {
      const state = effectiveState(link);
      return `
          <tr>
            <td class="slug-cell"><code>/${escapeHtml(link.path)}</code></td>
            <td class="state-cell"><span class="state ${stateClass(state)}">${escapeHtml(label(state))}</span></td>
            <td class="title-cell"><strong>${escapeHtml(link.title || "—")}</strong><br><span class="muted">${escapeHtml(link.description || "")}</span></td>
            <td class="target-cell"><a href="${escapeAttr(link.target)}" target="_blank" rel="noreferrer">${wrapLongText(link.target, 60)}</a></td>
            <td class="owner-cell">${escapeHtml(link.owner || "—")}</td>
            <td class="tags-cell">${Array.isArray(link.tags) ? link.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("") : "—"}</td>
            <td class="expires-cell">${escapeHtml(link.expires_at || "—")}</td>
          </tr>
        `;
    })
    .join("");
}

function label(value) {
  return msg.states[value] || value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function renderGeneratedLine(registry) {
  const generated = formatGeneratedLine(registry?.generated_at, registry?.generated_timezone);
  const commit = String(registry?.generated_git?.commit || "").trim();
  const commitUrl = String(registry?.generated_git?.commit_url || "").trim();
  if (!commit) return escapeHtml(generated);

  const shortCommit = commit.slice(0, 7);
  const commitLabel = `${msg.commit} ${shortCommit}`;
  const commitHtml = commitUrl
    ? `<a href="${escapeAttr(commitUrl)}" target="_blank" rel="noreferrer">${escapeHtml(commitLabel)}</a>`
    : escapeHtml(commitLabel);

  return `${escapeHtml(generated)} / ${commitHtml}`;
}

function formatGeneratedLine(value, timezone) {
  if (!value) return msg.generatedFallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return msg.generatedFallback;

  const displayTimezone = validTimezone(timezone) ? timezone : undefined;
  const formatted = date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(displayTimezone ? { timeZone: displayTimezone } : {})
  });

  return `${msg.generatedPrefix} ${formatted}`;
}

async function renderReleaseStatus() {
  try {
    const response = await fetch("/v8s-release-manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("release manifest unavailable");
    const releaseManifest = await response.json();
    const version = String(releaseManifest?.package?.version || "").trim();
    if (!version) throw new Error("release version unavailable");
    releaseStatusEl.innerHTML = `${escapeHtml(msg.release)} ${escapeHtml(version)}`;
    checkLatestRelease(version);
  } catch {
    releaseStatusEl.textContent = msg.releaseUnknown;
  }
}

async function checkLatestRelease(currentVersion) {
  try {
    const response = await fetch("https://api.github.com/repos/vanityURLs/code/releases/latest", {
      headers: { accept: "application/vnd.github+json" }
    });
    if (!response.ok) return;
    const latest = await response.json();
    const latestVersion = String(latest?.tag_name || latest?.name || "").replace(/^v/i, "");
    if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return;
    const htmlUrl = String(latest?.html_url || "https://github.com/vanityURLs/code/releases/latest");
    releaseStatusEl.innerHTML += ` · <a href="${escapeAttr(htmlUrl)}" target="_blank" rel="noreferrer">${escapeHtml(msg.newRelease)} ${escapeHtml(latestVersion)}</a>`;
  } catch {
    // Release checks are helpful, not required for dashboard operation.
  }
}

function isNewerVersion(latest, current) {
  const latestParts = semverParts(latest);
  const currentParts = semverParts(current);
  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index += 1) {
    const left = latestParts[index] || 0;
    const right = currentParts[index] || 0;
    if (left !== right) return left > right;
  }
  return false;
}

function semverParts(value) {
  return String(value)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function applyTranslations() {
  document.title = msg.title;
  searchEl.placeholder = msg.searchPlaceholder;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const value = lookupMessage(element.dataset.i18n);
    if (value) element.textContent = value;
  }
}

function lookupMessage(path) {
  return String(path || "")
    .split(".")
    .reduce((value, key) => value?.[key], msg);
}

function wrapLongText(value, size = 60) {
  const text = String(value ?? "");
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(escapeHtml(text.slice(index, index + size)));
  }
  return chunks.join("<wbr>");
}

function validTimezone(timezone) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function stateClass(state) {
  if (["permanent", "ephemeral"].includes(state)) return "ok";
  if (["expired", "disabled", "maintenance"].includes(state)) return "warn";
  return "bad";
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
