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

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-rss]");
  if (!button) return;

  const url = button.dataset.copyRss;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
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
  } catch {
    window.location.href = url;
  }
});
