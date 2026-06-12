const article = document.querySelector(".article-page");
const pill = document.querySelector(".reading-pill");
const percent = document.querySelector("#readingPercent");
const remaining = document.querySelector("#readingRemaining");
const totalMinutes = Math.max(1, Number.parseInt(pill?.dataset.readingMinutes || "1", 10));
const postSlug = pill?.dataset.postSlug || article?.dataset.postSlug || "";
const viewNodes = Array.from(document.querySelectorAll("[data-view-slug]")).filter(
  (node) => node.dataset.viewSlug === postSlug
);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateReadingProgress() {
  if (!article || !percent || !remaining) return;

  const root = document.documentElement;
  const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
  const current = window.scrollY || root.scrollTop || 0;
  const value = clamp(Math.round((current / maxScroll) * 100), 0, 100);
  const remainingMinutes = Math.max(0, Math.ceil(totalMinutes * (1 - value / 100)));

  pill?.style.setProperty("--reading-progress", `${value}%`);
  percent.textContent = `${value}%`;
  remaining.textContent = remainingMinutes > 0 ? `剩余 ≈ ${remainingMinutes} 分钟` : "已读完";
}

function viewedTodayKey() {
  return `soloblog:viewed:${postSlug}:${new Date().toISOString().slice(0, 10)}`;
}

function hasViewedToday() {
  try {
    return window.localStorage.getItem(viewedTodayKey()) === "1";
  } catch {
    return false;
  }
}

function markViewedToday() {
  try {
    window.localStorage.setItem(viewedTodayKey(), "1");
  } catch {
    // localStorage may be disabled in private browsing modes.
  }
}

function renderViewCount(views) {
  const count = Math.max(0, Number.parseInt(views, 10) || 0);
  const text = `阅读 ${new Intl.NumberFormat("zh-CN").format(count)}`;
  for (const node of viewNodes) {
    node.hidden = false;
    node.textContent = text;
  }
}

async function updateViewCount() {
  if (!postSlug || viewNodes.length === 0) return;

  const alreadyViewed = hasViewedToday();
  const response = alreadyViewed
    ? await fetch(`/api/views?slug=${encodeURIComponent(postSlug)}`, {
        headers: { Accept: "application/json" }
      })
    : await fetch("/api/views", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ slug: postSlug })
      });

  if (!response.ok) throw new Error("View counter is unavailable.");
  const data = await response.json();
  renderViewCount(data.views);

  if (!alreadyViewed) markViewedToday();
}

updateReadingProgress();
updateViewCount().catch(() => {
  for (const node of viewNodes) node.hidden = true;
});

article?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-code]");
  if (!button) return;

  const code = button.closest("pre")?.querySelector("code")?.textContent || "";
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    button.classList.add("is-copied");
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.textContent = "复制";
    }, 1400);
  } catch {
    button.textContent = "复制失败";
    window.setTimeout(() => {
      button.textContent = "复制";
    }, 1400);
  }
});

window.addEventListener("scroll", updateReadingProgress, { passive: true });
window.addEventListener("resize", updateReadingProgress);
