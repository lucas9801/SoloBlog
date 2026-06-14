const documentRef = typeof document === "undefined" ? null : document;
const viewNodes = Array.from(documentRef?.querySelectorAll("[data-view-slug]") || []);
const rankingList = documentRef?.querySelector("[data-ranking-posts]") || null;
const rankingTitle = documentRef?.querySelector("[data-ranking-title]") || null;

function uniqueSlugs(nodes) {
  return Array.from(new Set(nodes.map((node) => node.dataset.viewSlug).filter(Boolean)));
}

function renderViews(viewsBySlug) {
  const formatter = new Intl.NumberFormat("zh-CN");
  for (const node of viewNodes) {
    const slug = node.dataset.viewSlug;
    if (!slug || !(slug in viewsBySlug)) continue;
    node.hidden = false;
    node.textContent = `阅读 ${formatter.format(Math.max(0, Number.parseInt(viewsBySlug[slug], 10) || 0))}`;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

async function loadViews() {
  const slugs = uniqueSlugs(viewNodes);
  if (slugs.length === 0) return;

  const params = new URLSearchParams({ slugs: slugs.join(",") });
  const response = await fetch(`/api/views?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error("View counter is unavailable.");
  const data = await response.json();
  const viewsBySlug =
    data.views && typeof data.views === "object" ? data.views : { [data.slug]: data.views };
  renderViews(viewsBySlug);
}

function parseRankingPosts() {
  if (!rankingList) return [];
  try {
    return JSON.parse(rankingList.dataset.rankingPosts || "[]");
  } catch {
    return [];
  }
}

export function rankingItems(ranking, posts, limit = 5) {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const seenSlugs = new Set();
  const ranked = ranking
    .map((entry) => {
      const post = bySlug.get(entry.slug);
      if (!post || seenSlugs.has(entry.slug)) return null;
      seenSlugs.add(entry.slug);
      return {
        ...post,
        ranked: true,
        views: Math.max(0, Number.parseInt(entry.views, 10) || 0)
      };
    })
    .filter(Boolean);
  const fallback = posts
    .filter((post) => post.slug && !seenSlugs.has(post.slug))
    .map((post) => ({
      ...post,
      ranked: false,
      views: 0
    }));

  return [...ranked, ...fallback]
    .filter((item) => item.slug && item.title && item.url)
    .slice(0, limit);
}

function renderRanking(ranking, posts) {
  if (!rankingList) return;
  const items = rankingItems(ranking, posts, 5);

  if (items.length === 0) return;

  const formatter = new Intl.NumberFormat("zh-CN");
  if (rankingTitle) rankingTitle.textContent = "阅读排行";
  rankingList.innerHTML = items
    .map(
      (item, index) => {
        const meta = item.ranked
          ? `阅读 ${formatter.format(item.views)}`
          : [formatDate(item.date), escapeHtml(item.category || "近期文章")].filter(Boolean).join(" · ");
        return `<a class="ranking-link" href="${escapeHtml(item.url)}"><b>${index + 1}</b><span>${escapeHtml(item.title)}</span><small>${meta}</small></a>`;
      }
    )
    .join("");
}

async function loadRanking() {
  if (!rankingList) return;
  const posts = parseRankingPosts();
  if (posts.length === 0) return;

  const response = await fetch("/api/views?top=5", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Reading ranking is unavailable.");
  const data = await response.json();
  renderRanking(data.ranking || [], posts);
}

if (documentRef) {
  loadViews().catch(() => {
    for (const node of viewNodes) node.hidden = true;
  });

  loadRanking().catch(() => {});
}
