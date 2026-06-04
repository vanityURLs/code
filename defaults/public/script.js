const REDIRECT_LAUNCH_DELAY_MS = 280;
let redirectInFlight = false;

async function redirect(event) {
  event.preventDefault();

  if (redirectInFlight) {
    return;
  }

  const input = document.getElementById("redirectKey");
  const key = input ? input.value.trim() : "";
  if (!key) {
    return;
  }

  const shortPath = `/${key}`;
  const shouldAnimate = await hasRedirectTarget(shortPath);

  if (shouldAnimate) {
    redirectInFlight = true;
    document.body.classList.add("redirect-launch");
    window.setTimeout(() => {
      window.location.href = shortPath;
    }, REDIRECT_LAUNCH_DELAY_MS);
    return;
  }

  window.location.href = shortPath;
}

const languageMap = {
  fr: "fr",
  en: "en",
  de: "de",
  es: "es",
  pt: "pt",
  hi: "hi",
  ja: "ja",
  zh: "zh"
};

function setDocumentLanguage() {
  const userLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();

  if (userLang.startsWith("jp")) {
    document.documentElement.lang = "ja";
    return;
  }

  for (const [prefix, lang] of Object.entries(languageMap)) {
    if (userLang.startsWith(prefix)) {
      document.documentElement.lang = lang;
      return;
    }
  }

  document.documentElement.lang = "en";
}

function applyStyleVariant() {
  const params = new URLSearchParams(window.location.search);
  const style = params.get("style");
  const variant = style === "terminal" ? "terminal" : "editorial";

  document.documentElement.dataset.style = variant;
}

function triggerInvalidRedirectFeedback(invalidKey) {
  const form = document.querySelector(".redirect-form");
  const input = document.getElementById("redirectKey");

  redirectInFlight = false;
  document.body.classList.remove("redirect-launch");

  if (!form || !input) {
    return;
  }

  input.value = invalidKey;
  syncFormState();
  autosizeInput();

  form.classList.remove("is-invalid");
  void form.offsetWidth;
  form.classList.add("is-invalid");

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  window.setTimeout(syncViewportLayout, 50);
}

function playReturnAnimation() {
  const pageShell = document.querySelector(".page-shell");
  if (!pageShell) {
    return;
  }

  redirectInFlight = false;
  document.body.classList.remove("redirect-launch");
  document.body.classList.remove("redirect-return");
  void pageShell.offsetWidth;
  document.body.classList.add("redirect-return");

  window.setTimeout(() => {
    document.body.classList.remove("redirect-return");
  }, 320);
}

function resetRedirectUiState() {
  redirectInFlight = false;
  document.body.classList.remove("redirect-launch");
  document.body.classList.remove("redirect-return");
}

function syncViewportLayout() {
  const pageShell = document.querySelector(".page-shell");
  if (!pageShell) {
    return;
  }

  if (window.innerWidth > 768 || !window.visualViewport) {
    document.documentElement.style.setProperty("--visual-viewport-top", "0px");
    document.documentElement.style.setProperty("--visual-viewport-height", "100dvh");
    return;
  }

  document.documentElement.style.setProperty("--visual-viewport-top", `${window.visualViewport.offsetTop}px`);
  document.documentElement.style.setProperty("--visual-viewport-height", `${window.visualViewport.height}px`);
}

function checkForInvalidRedirect() {
  const currentPath = window.location.pathname;

  if (currentPath !== "/" && !/\/index\.html$/i.test(currentPath)) {
    triggerInvalidRedirectFeedback(currentPath.replace(/^\//, ""));
    return true;
  }

  return false;
}

function syncFormState() {
  const form = document.querySelector(".redirect-form");
  const input = document.getElementById("redirectKey");
  if (!form || !input) {
    return;
  }

  form.classList.toggle("has-value", input.value.trim().length > 0);
}

function autosizeInput() {
  const input = document.getElementById("redirectKey");
  if (!input) {
    return;
  }

  if (input.tagName.toLowerCase() !== "textarea") {
    return;
  }

  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function clearRedirectInput() {
  const input = document.getElementById("redirectKey");
  if (!input) {
    return;
  }

  input.value = "";
  syncFormState();
  autosizeInput();
  syncViewportLayout();
}

function focusRedirectInput() {
  const input = document.getElementById("redirectKey");
  if (!input) {
    return;
  }

  input.focus({ preventScroll: true });
}

function shouldPreserveDesktopFocus(target) {
  if (window.innerWidth <= 768 || !(target instanceof Element)) {
    return false;
  }

  return !target.closest("a, button, textarea, input, select, option, label");
}

let keyboardViewportHeight = null;

function detectKeyboard() {
  const pageShell = document.querySelector(".page-shell");
  if (!pageShell) {
    return;
  }

  syncViewportLayout();

  if (window.innerWidth > 768) {
    pageShell.classList.remove("keyboard-visible");
    keyboardViewportHeight = null;
    return;
  }

  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (keyboardViewportHeight === null || viewportHeight > keyboardViewportHeight) {
    keyboardViewportHeight = viewportHeight;
  }

  const heightDiff = keyboardViewportHeight - viewportHeight;
  const isKeyboardVisible = heightDiff > 150;

  pageShell.classList.toggle("keyboard-visible", isKeyboardVisible);
}

async function hasRedirectTarget(sourcePath) {
  return sourcePath.length > 1;
}

document.addEventListener("DOMContentLoaded", () => {
  setDocumentLanguage();
  applyStyleVariant();
  const hasInvalidRedirect = checkForInvalidRedirect();
  syncFormState();
  autosizeInput();
  syncViewportLayout();

  if (hasInvalidRedirect) {
    playReturnAnimation();
  }

  const input = document.getElementById("redirectKey");
  if (!input) {
    return;
  }

  const form = input.closest("form");
  if (form) {
    form.addEventListener("submit", redirect);
  }

  if (window.innerWidth > 768) {
    focusRedirectInput();
  }

  const maxRedirectKeyLength = input.maxLength > 0 ? input.maxLength : Infinity;

  input.addEventListener("input", (event) => {
    const allowedPattern = /[^a-zA-Z0-9\-_\/]/g;
    const currentValue = event.target.value;
    const filteredValue = currentValue.replace(allowedPattern, "").slice(0, maxRedirectKeyLength);

    if (currentValue !== filteredValue) {
      event.target.value = filteredValue;
    }

    syncFormState();
    autosizeInput();
    syncViewportLayout();
    detectKeyboard();
  });

  input.addEventListener("paste", (event) => {
    event.preventDefault();

    const pastedText = (event.clipboardData || window.clipboardData).getData("text");
    const filteredText = pastedText.replace(/[^a-zA-Z0-9\-_\/]/g, "");
    const start = event.target.selectionStart;
    const end = event.target.selectionEnd;
    const currentValue = event.target.value;
    const nextValue = (currentValue.substring(0, start) + filteredText + currentValue.substring(end)).slice(
      0,
      maxRedirectKeyLength
    );

    event.target.value = nextValue;
    const nextCursor = Math.min(start + filteredText.length, nextValue.length);
    event.target.setSelectionRange(nextCursor, nextCursor);
    syncFormState();
    autosizeInput();
    syncViewportLayout();
    detectKeyboard();
  });

  input.addEventListener("focus", () => {
    window.setTimeout(detectKeyboard, 250);
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      const pageShell = document.querySelector(".page-shell");
      if (pageShell) {
        pageShell.classList.remove("keyboard-visible");
      }

      keyboardViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      syncViewportLayout();

      if (window.innerWidth > 768 && document.activeElement !== input) {
        focusRedirectInput();
      }
    }, 250);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      const form = input.closest("form");
      if (form) {
        form.requestSubmit();
      }

      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    clearRedirectInput();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!shouldPreserveDesktopFocus(event.target)) {
      return;
    }

    window.setTimeout(focusRedirectInput, 0);
  });

  window.addEventListener("focus", () => {
    resetRedirectUiState();

    if (window.innerWidth > 768) {
      focusRedirectInput();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      resetRedirectUiState();
    }
  });

  window.addEventListener("pageshow", resetRedirectUiState);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("scroll", syncViewportLayout);
  window.visualViewport.addEventListener("resize", detectKeyboard);
} else {
  window.addEventListener("resize", detectKeyboard);
}

window.addEventListener("resize", syncViewportLayout);
