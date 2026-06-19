const article = document.querySelector(".article-page");
const readingTarget = document.querySelector(".article-content") || article;
const pill = document.querySelector(".reading-pill");
const percent = document.querySelector("#readingPercent");
const remaining = document.querySelector("#readingRemaining");
const totalMinutes = Math.max(1, Number.parseInt(pill?.dataset.readingMinutes || "1", 10));
const postSlug = pill?.dataset.postSlug || article?.dataset.postSlug || "";
const tocLinks = Array.from(document.querySelectorAll("[data-toc-target]"));
const tocHeadings = tocLinks
  .map((link) => document.getElementById(link.dataset.tocTarget || ""))
  .filter(Boolean);
const viewNodes = Array.from(document.querySelectorAll("[data-view-slug]")).filter(
  (node) => node.dataset.viewSlug === postSlug
);
const commentsSection = document.querySelector("[data-giscus-comments]");
let metricsUpdateQueued = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function updateReadingProgress() {
  if (!readingTarget || !percent || !remaining) return;

  const rect = readingTarget.getBoundingClientRect();
  const readingLine = Math.min(220, window.innerHeight * 0.32);
  const completionLine = Math.min(window.innerHeight * 0.76, window.innerHeight - 96);
  const readDistance = readingLine - rect.top;
  const readableDistance = Math.max(1, rect.height - Math.max(0, completionLine - readingLine));
  const pageBottomReached = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  const value = pageBottomReached ? 100 : clamp(Math.round((readDistance / readableDistance) * 100), 0, 100);
  const remainingMinutes = Math.max(0, Math.ceil(totalMinutes * (1 - value / 100)));

  pill?.style.setProperty("--reading-progress", `${value}%`);
  percent.textContent = `${value}%`;
  remaining.textContent = remainingMinutes > 0 ? `剩余 ≈ ${remainingMinutes} 分钟` : "已读完";
}

function setActiveToc(id) {
  for (const link of tocLinks) {
    const active = link.dataset.tocTarget === id;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function updateActiveToc() {
  if (tocHeadings.length === 0) return;

  const threshold = Math.min(180, window.innerHeight * 0.28);
  let activeId = tocHeadings[0].id;

  for (const heading of tocHeadings) {
    if (heading.getBoundingClientRect().top <= threshold) {
      activeId = heading.id;
    } else {
      break;
    }
  }

  setActiveToc(activeId);
}

function updateArticleMetrics() {
  updateReadingProgress();
  updateActiveToc();
}

function scheduleArticleMetricsUpdate() {
  if (metricsUpdateQueued) return;
  metricsUpdateQueued = true;
  window.requestAnimationFrame(() => {
    metricsUpdateQueued = false;
    updateArticleMetrics();
  });
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

function loadComments() {
  if (!commentsSection || commentsSection.dataset.loaded === "true") return;

  const frame = commentsSection.querySelector("[data-comments-frame]");
  const loader = commentsSection.querySelector("[data-comments-loader]");
  if (!frame) return;

  commentsSection.dataset.loaded = "true";
  const loaderText = loader?.querySelector("p");
  const loaderButton = loader?.querySelector("[data-load-comments]");
  if (loaderText) loaderText.textContent = "评论加载中...";
  if (loaderButton) {
    loaderButton.disabled = true;
    loaderButton.textContent = "加载中";
  }

  let slowTimer = 0;
  const finish = () => {
    window.clearTimeout(slowTimer);
    loader?.remove();
  };
  const observer =
    "MutationObserver" in window
      ? new MutationObserver(() => {
          if (frame.querySelector("iframe")) {
            observer.disconnect();
            finish();
          }
        })
      : null;
  observer?.observe(frame, { childList: true, subtree: true });
  slowTimer = window.setTimeout(() => {
    if (!frame.querySelector("iframe") && loaderText) {
      loaderText.textContent = "评论加载较慢，请稍候。";
    }
  }, 5000);

  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-repo", commentsSection.dataset.repo || "");
  script.setAttribute("data-repo-id", commentsSection.dataset.repoId || "");
  script.setAttribute("data-category", commentsSection.dataset.category || "");
  script.setAttribute("data-category-id", commentsSection.dataset.categoryId || "");
  script.setAttribute("data-mapping", commentsSection.dataset.mapping || "pathname");
  script.setAttribute("data-strict", commentsSection.dataset.strict || "0");
  script.setAttribute("data-reactions-enabled", commentsSection.dataset.reactionsEnabled || "1");
  script.setAttribute("data-emit-metadata", commentsSection.dataset.emitMetadata || "0");
  script.setAttribute("data-input-position", commentsSection.dataset.inputPosition || "bottom");
  script.setAttribute("data-theme", giscusTheme());
  script.setAttribute("data-lang", commentsSection.dataset.lang || document.documentElement.lang || "zh-CN");
  script.setAttribute("data-loading", "lazy");
  script.addEventListener("error", () => {
    observer?.disconnect();
    window.clearTimeout(slowTimer);
    script.remove();
    commentsSection.dataset.loaded = "false";
    if (loaderText) loaderText.textContent = "评论暂时加载失败。";
    if (loaderButton) {
      loaderButton.disabled = false;
      loaderButton.textContent = "重新加载";
    }
  });
  frame.append(script);
}

function giscusTheme() {
  const configured = commentsSection?.dataset.theme || "preferred_color_scheme";
  if (configured !== "preferred_color_scheme") return configured;
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function prepareComments() {
  if (!commentsSection) return;

  commentsSection.querySelector("[data-load-comments]")?.addEventListener("click", loadComments);

  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadComments();
    },
    { rootMargin: "420px 0px" }
  );
  observer.observe(commentsSection);
}

updateArticleMetrics();
prepareComments();
updateViewCount().catch(() => {
  for (const node of viewNodes) node.hidden = true;
});

article?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const articleLinkButton = target?.closest("[data-copy-article-url]");
  if (articleLinkButton) {
    const status = articleLinkButton.parentElement?.querySelector("[data-copy-article-status]");
    const previousText = articleLinkButton.textContent;
    const previousLabel = articleLinkButton.getAttribute("aria-label");
    const url = articleLinkButton.dataset.copyArticleUrl || window.location.href;

    if (await copyText(url)) {
      articleLinkButton.textContent = "已复制";
      articleLinkButton.setAttribute("aria-label", "本文链接已复制");
      if (status) status.textContent = "本文链接已复制";
    } else {
      articleLinkButton.textContent = "复制失败";
      articleLinkButton.setAttribute("aria-label", "本文链接复制失败");
      if (status) status.textContent = "本文链接复制失败";
    }

    window.setTimeout(() => {
      articleLinkButton.textContent = previousText;
      if (previousLabel) {
        articleLinkButton.setAttribute("aria-label", previousLabel);
      } else {
        articleLinkButton.removeAttribute("aria-label");
      }
      if (status) status.textContent = "";
    }, 1400);
    return;
  }

  const button = target?.closest("[data-copy-code]");
  if (!button) return;

  const block = button.closest("pre");
  const code = block?.querySelector("code")?.textContent || "";
  const status = block?.querySelector("[data-copy-code-status]");
  if (!code) return;

  if (await copyText(code)) {
    button.classList.add("is-copied");
    button.textContent = "已复制";
    button.setAttribute("aria-label", "代码已复制");
    if (status) status.textContent = "代码已复制";
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制代码");
      if (status) status.textContent = "";
    }, 1400);
    return;
  }

  button.textContent = "复制失败";
  button.setAttribute("aria-label", "代码复制失败");
  if (status) status.textContent = "代码复制失败";
  window.setTimeout(() => {
    button.textContent = "复制";
    button.setAttribute("aria-label", "复制代码");
    if (status) status.textContent = "";
  }, 1400);
});

window.addEventListener("scroll", scheduleArticleMetricsUpdate, { passive: true });
window.addEventListener("resize", scheduleArticleMetricsUpdate);
