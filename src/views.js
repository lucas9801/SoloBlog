const viewNodes = Array.from(document.querySelectorAll("[data-view-slug]"));
const rankingList = document.querySelector("[data-ranking-posts]");

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

function renderRanking(ranking, posts) {
  if (!rankingList) return;
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const items = ranking
    .map((entry) => ({
      ...bySlug.get(entry.slug),
      views: Math.max(0, Number.parseInt(entry.views, 10) || 0)
    }))
    .filter((item) => item.slug && item.title && item.url)
    .slice(0, 5);

  if (items.length === 0) return;

  const formatter = new Intl.NumberFormat("zh-CN");
  rankingList.innerHTML = items
    .map(
      (item, index) =>
        `<a class="ranking-link" href="${escapeHtml(item.url)}"><b>${index + 1}</b><span>${escapeHtml(item.title)}</span><small>阅读 ${formatter.format(item.views)}</small></a>`
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

loadViews().catch(() => {
  for (const node of viewNodes) node.hidden = true;
});

loadRanking().catch(() => {});
