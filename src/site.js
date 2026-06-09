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
    header.classList.remove("is-hidden");
  } else if (delta > 6 && scrollingDown) {
    header.classList.add("is-hidden");
  } else if (delta > 6 && !scrollingDown) {
    header.classList.remove("is-hidden");
  }

  lastScrollY = currentY;
  ticking = false;
}

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
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1600);
  } catch {
    window.location.href = url;
  }
});
