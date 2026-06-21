const header = document.querySelector(".site-header");
const themeToggle = document.querySelector("[data-theme-toggle]");
const scrollTopButton = document.querySelector("[data-scroll-top]");
const readModeButton = document.querySelector("[data-read-mode]");
const rssCopyStates = new WeakMap();
let lastScrollY = window.scrollY;
let ticking = false;

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function syncGiscusTheme(theme) {
  const frame = document.querySelector("iframe.giscus-frame");
  if (!frame) return;
  frame.contentWindow?.postMessage(
    {
      giscus: {
        setConfig: {
          theme: theme === "dark" ? "dark" : "light"
        }
      }
    },
    "https://giscus.app"
  );
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle?.setAttribute("aria-label", theme === "dark" ? "切换浅色模式" : "切换深色模式");
  syncGiscusTheme(theme);
}

function revealHeader() {
  header?.classList.remove("is-hidden");
}

function headerContainsFocus() {
  return Boolean(header?.contains(document.activeElement));
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary selection below.
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement;
  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();
  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  if (activeElement instanceof HTMLElement) activeElement.focus();
  return copied;
}

applyTheme(currentTheme());

themeToggle?.addEventListener("click", () => {
  const nextTheme = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("solus-theme", nextTheme);
  } catch {
    // Ignore storage failures in restrictive browsing modes.
  }
  applyTheme(nextTheme);
});

function updateHeaderVisibility() {
  if (!header) return;

  const currentY = Math.max(0, window.scrollY);
  const scrollingDown = currentY > lastScrollY;
  const delta = Math.abs(currentY - lastScrollY);

  if (currentY < 80) {
    revealHeader();
  } else if (headerContainsFocus()) {
    revealHeader();
  } else if (delta > 6 && scrollingDown) {
    header.classList.add("is-hidden");
  } else if (delta > 6 && !scrollingDown) {
    revealHeader();
  }

  lastScrollY = currentY;
  ticking = false;
}

function updateScrollTopButton() {
  if (!scrollTopButton) return;
  scrollTopButton.classList.toggle("is-visible", window.scrollY > 420);
}

function setReadMode(enabled) {
  if (!readModeButton) return;
  document.body.classList.toggle("is-reading-mode", enabled);
  readModeButton.setAttribute("aria-pressed", String(enabled));
  readModeButton.setAttribute("aria-label", enabled ? "Exit focused reading" : "Enter focused reading");
}

function storedReadMode() {
  try {
    return localStorage.getItem("solus-read-mode") === "true";
  } catch {
    return false;
  }
}

header?.addEventListener("focusin", revealHeader);
scrollTopButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
readModeButton?.addEventListener("click", () => {
  const enabled = !document.body.classList.contains("is-reading-mode");
  setReadMode(enabled);
  try {
    localStorage.setItem("solus-read-mode", String(enabled));
  } catch {
    // Ignore storage failures in restrictive browsing modes.
  }
});
if (readModeButton) {
  setReadMode(storedReadMode());
}

window.addEventListener(
  "scroll",
  () => {
    updateScrollTopButton();
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeaderVisibility);
  },
  { passive: true }
);
updateScrollTopButton();

function siteSearchTarget(form) {
  const input = form.querySelector('input[name="q"]');
  const query = input instanceof HTMLInputElement ? input.value.trim() : "";
  const target = new URL(form.getAttribute("action") || "/search/", window.location.origin);

  target.search = "";
  if (query) target.searchParams.set("q", query);
  return `${target.pathname}${target.search}${target.hash}`;
}

function isMobileSearchViewport() {
  return window.matchMedia?.("(max-width: 720px)").matches ?? window.innerWidth <= 720;
}

function setMobileSearchExpanded(form, expanded) {
  const button = form.querySelector('button[type="submit"]');
  const headerRoot = form.closest(".site-header");
  form.classList.toggle("is-expanded", expanded);
  headerRoot?.classList.toggle("is-search-open", expanded);
  button?.setAttribute("aria-expanded", String(expanded));
}

for (const form of document.querySelectorAll(".site-search")) {
  const input = form.querySelector('input[name="q"]');
  const button = form.querySelector('button[type="submit"]');
  button?.setAttribute("aria-expanded", "false");

  form.addEventListener("submit", (event) => {
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (
      isMobileSearchViewport() &&
      !form.classList.contains("is-expanded") &&
      input instanceof HTMLInputElement &&
      !input.value.trim()
    ) {
      setMobileSearchExpanded(form, true);
      input.focus();
      return;
    }
    window.location.href = siteSearchTarget(form);
  });

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !form.classList.contains("is-expanded")) return;
    if (input instanceof HTMLInputElement && input.value.trim()) {
      input.value = "";
      event.preventDefault();
      return;
    }
    setMobileSearchExpanded(form, false);
    if (button instanceof HTMLElement) button.focus();
    event.preventDefault();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  for (const form of document.querySelectorAll(".site-search.is-expanded")) {
    const input = form.querySelector('input[name="q"]');
    if (target && form.contains(target)) continue;
    if (input instanceof HTMLInputElement && input.value.trim()) continue;
    setMobileSearchExpanded(form, false);
  }
});

window.addEventListener("resize", () => {
  if (isMobileSearchViewport()) return;
  for (const form of document.querySelectorAll(".site-search.is-expanded")) {
    setMobileSearchExpanded(form, false);
  }
});

function setRssCopyState(button, visibleText, statusMessage = visibleText, restoreDelay = 1600) {
  const status = button.parentElement?.querySelector("[data-copy-rss-status]");
  const state = rssCopyStates.get(button) || {
    text: button.textContent || "",
    label: button.getAttribute("aria-label"),
    timer: 0
  };

  if (state.timer) window.clearTimeout(state.timer);
  rssCopyStates.set(button, state);
  button.textContent = visibleText;
  button.setAttribute("aria-label", statusMessage);
  if (status) status.textContent = statusMessage;

  state.timer = window.setTimeout(() => {
    button.textContent = state.text;
    if (state.label) {
      button.setAttribute("aria-label", state.label);
    } else {
      button.removeAttribute("aria-label");
    }
    if (status) status.textContent = "";
    rssCopyStates.delete(button);
  }, restoreDelay);
}

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-copy-rss]");
  if (!(button instanceof HTMLElement)) return;
  if (button.dataset.copyPending === "true") return;

  const url = button.dataset.copyRss;
  if (!url) return;

  button.dataset.copyPending = "true";
  button.setAttribute("aria-busy", "true");
  if (button instanceof HTMLButtonElement) button.disabled = true;
  const copied = await copyText(url);
  delete button.dataset.copyPending;
  button.removeAttribute("aria-busy");
  if (button instanceof HTMLButtonElement) button.disabled = false;

  if (copied) {
    setRssCopyState(button, "已复制", "RSS 链接已复制");
    return;
  }

  setRssCopyState(button, "复制失败", "RSS 链接复制失败", 2200);
});
