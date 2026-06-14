const header = document.querySelector(".site-header");
const themeToggle = document.querySelector("[data-theme-toggle]");
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

header?.addEventListener("focusin", revealHeader);

window.addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeaderVisibility);
  },
  { passive: true }
);

function siteSearchTarget(form) {
  const input = form.querySelector('input[name="q"]');
  const query = input instanceof HTMLInputElement ? input.value.trim() : "";
  const target = new URL(form.getAttribute("action") || "/search/", window.location.origin);

  target.search = "";
  if (query) target.searchParams.set("q", query);
  return `${target.pathname}${target.search}${target.hash}`;
}

for (const form of document.querySelectorAll(".site-search")) {
  form.addEventListener("submit", (event) => {
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    window.location.href = siteSearchTarget(form);
  });
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-rss]");
  if (!button) return;

  const url = button.dataset.copyRss;
  if (!url) return;

  if (await copyText(url)) {
    const previous = button.textContent;
    const previousLabel = button.getAttribute("aria-label");
    const status = button.parentElement?.querySelector("[data-copy-rss-status]");
    button.textContent = "已复制";
    button.setAttribute("aria-label", "RSS 链接已复制");
    if (status) status.textContent = "RSS 链接已复制";
    window.setTimeout(() => {
      button.textContent = previous;
      if (previousLabel) {
        button.setAttribute("aria-label", previousLabel);
      } else {
        button.removeAttribute("aria-label");
      }
      if (status) status.textContent = "";
    }, 1600);
    return;
  }

  window.location.href = url;
});

function archiveFilterTarget(form) {
  const year = form.querySelector("[data-archive-year]")?.value || "";
  const category = form.querySelector("[data-archive-category]");
  const categorySlug = category?.selectedOptions?.[0]?.dataset.categorySlug || "";

  if (year && categorySlug) return `/archive/${year}/${categorySlug}/`;
  if (year) return `/years/${year}/`;
  if (categorySlug) return `/categories/${categorySlug}/`;
  return "/archive/";
}

function applyArchiveFilter(form) {
  const target = archiveFilterTarget(form);
  if (target === window.location.pathname) return;
  window.location.href = target;
}

for (const form of document.querySelectorAll("[data-archive-filter-form]")) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyArchiveFilter(form);
  });

  for (const select of form.querySelectorAll("[data-archive-year], [data-archive-category]")) {
    select.addEventListener("change", () => applyArchiveFilter(form));
  }
}
